import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { logJobEvent, claimCallbackProcessing } from "@/lib/job-events";
import { writeAuditLog } from "@/lib/audit-log";

/**
 * POST /api/admin/ops/cancel-job — Cancel a queued/pending job.
 *
 * Body: { job_id: string, job_type: "generation" | "generation_request" }
 *
 * For generation jobs: marks as cancelled (best-effort; RunPod job may still run).
 * For generation requests: marks request as cancelled and all pending child jobs.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(user.id, user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { job_id?: string; job_type?: string; reason?: string };
  const { job_id, job_type, reason } = body;
  if (!job_id || !job_type) return NextResponse.json({ error: "job_id and job_type required" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const cancelReason = reason || `Cancelled by admin (${user.email})`;

  if (job_type === "generation") {
    const { data: job } = await admin
      .from("generation_jobs")
      .select("id, status")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const jobStatus = job.status as string;
    if (jobStatus === "completed" || jobStatus === "cancelled") {
      return NextResponse.json({ error: `Job is already ${jobStatus}` }, { status: 400 });
    }

    await admin
      .from("generation_jobs")
      .update({ status: "cancelled", failure_reason: cancelReason })
      .eq("id", job_id);

    // Fix 5: pre-claim both terminal slots so any in-flight RunPod callback
    // for this job gets dropped on the floor by the webhook's atomic claim.
    await claimCallbackProcessing("generation", job_id, "completed", {
      reason: "admin_cancel",
      admin_user: user.id,
    });
    await claimCallbackProcessing("generation", job_id, "failed", {
      reason: "admin_cancel",
      admin_user: user.id,
    });

    await logJobEvent({
      jobType: "generation",
      jobId: job_id,
      event: "cancelled",
      message: cancelReason,
      meta: { admin_user: user.id, previous_status: jobStatus },
    });

    await writeAuditLog(admin, {
      actor: user.id,
      actionType: "admin.ops.cancel_generation_job",
      entityRef: `generation_job:${job_id}`,
      beforeJson: { status: jobStatus },
      afterJson: { status: "cancelled", failure_reason: cancelReason },
    });

    return NextResponse.json({ ok: true, cancelled: 1 });
  }

  if (job_type === "generation_request") {
    const { data: req } = await admin
      .from("generation_requests")
      .select("id, status, user_id")
      .eq("id", job_id)
      .maybeSingle();
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    const reqStatus = req.status as string;
    if (reqStatus === "completed" || reqStatus === "failed") {
      return NextResponse.json({ error: `Request is already ${reqStatus}` }, { status: 400 });
    }

    // Cancel the request
    await admin
      .from("generation_requests")
      .update({
        status: "failed",
        failure_reason: cancelReason,
        failed_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    // Cancel all non-terminal child jobs
    const { data: childJobs } = await admin
      .from("generation_jobs")
      .select("id, status")
      .eq("generation_request_id", job_id)
      .in("status", ["pending", "running", "upscaling", "watermarking"]);

    let cancelledCount = 0;
    for (const child of (childJobs ?? []) as Array<{ id: string; status: string }>) {
      await admin
        .from("generation_jobs")
        .update({ status: "cancelled", failure_reason: cancelReason })
        .eq("id", child.id);
      // Fix 5: pre-claim both terminal slots for each cancelled child so any
      // in-flight RunPod callback is permanently deduped at the DB layer.
      await claimCallbackProcessing("generation", child.id, "completed", {
        reason: "admin_cancel_request",
        admin_user: user.id,
        generation_request_id: job_id,
      });
      await claimCallbackProcessing("generation", child.id, "failed", {
        reason: "admin_cancel_request",
        admin_user: user.id,
        generation_request_id: job_id,
      });
      cancelledCount++;
    }

    // Refund usage if no outputs were produced
    const { data: completedJobs } = await admin
      .from("generation_jobs")
      .select("id")
      .eq("generation_request_id", job_id)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();

    if (!completedJobs) {
      // No completed jobs — full refund
      const { data: usageEntry } = await admin
        .from("usage_ledger")
        .select("id, user_id, image_units, video_units, period_start, period_end")
        .eq("generation_request_id", job_id)
        .eq("source", "generation_request")
        .limit(1)
        .maybeSingle();
      if (usageEntry && (usageEntry.image_units > 0 || usageEntry.video_units > 0)) {
        const { data: existingRefund } = await admin
          .from("usage_ledger")
          .select("id")
          .eq("generation_request_id", job_id)
          .eq("source", "refund")
          .limit(1)
          .maybeSingle();
        if (!existingRefund) {
          await admin.from("usage_ledger").insert({
            user_id: usageEntry.user_id,
            generation_request_id: job_id,
            source: "refund",
            image_units: -(usageEntry.image_units as number),
            video_units: -(usageEntry.video_units as number),
            period_start: usageEntry.period_start,
            period_end: usageEntry.period_end,
            idempotency_key: `refund:${job_id}`,
            metadata_json: { reason: "admin_cancel" },
          });
        }
      }
    }

    await logJobEvent({
      jobType: "generation_request",
      jobId: job_id,
      event: "cancelled",
      message: cancelReason,
      meta: { admin_user: user.id, child_jobs_cancelled: cancelledCount },
    });

    await writeAuditLog(admin, {
      actor: user.id,
      actionType: "admin.ops.cancel_generation_request",
      entityRef: `generation_request:${job_id}`,
      beforeJson: { status: reqStatus },
      afterJson: { status: "failed", child_jobs_cancelled: cancelledCount },
    });

    // Notify user
    if (req.user_id) {
      try {
        await admin.from("user_notifications").insert({
          user_id: req.user_id,
          type: "generation_failed",
          payload_json: {
            generation_request_id: job_id,
            message: "Your content generation request has been cancelled. Your credits have been refunded.",
          },
        });
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ ok: true, cancelled_jobs: cancelledCount, refunded: !completedJobs });
  }

  return NextResponse.json({ error: "Unsupported job_type" }, { status: 400 });
}
