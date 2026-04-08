import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { logJobEvent } from "@/lib/job-events";
import { writeAuditLog } from "@/lib/audit-log";
import { failModel, getModelForTrainingJob } from "@/lib/identity-models";

/**
 * POST /api/admin/ops/mark-failed — Force-mark a stuck job as failed.
 *
 * Body: { job_id: string, job_type: "generation" | "training" | "identity_model", reason?: string }
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
  const failReason = reason || `Manually marked failed by admin (${user.email})`;

  if (job_type === "generation") {
    const { data: job } = await admin
      .from("generation_jobs")
      .select("id, status")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if ((job.status as string) === "completed" || (job.status as string) === "failed") {
      return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 400 });
    }

    await admin
      .from("generation_jobs")
      .update({ status: "failed", failure_reason: failReason, lease_owner: null, lease_until: null })
      .eq("id", job_id);

    await logJobEvent({
      jobType: "generation",
      jobId: job_id,
      event: "failed",
      message: failReason,
      meta: { admin_user: user.id, source: "admin_mark_failed" },
    });

    await writeAuditLog(admin, {
      actor: user.id,
      actionType: "admin.ops.mark_failed_generation_job",
      entityRef: `generation_job:${job_id}`,
      beforeJson: { status: job.status },
      afterJson: { status: "failed", failure_reason: failReason },
    });

    return NextResponse.json({ ok: true });
  }

  if (job_type === "training") {
    const { data: job } = await admin
      .from("training_jobs")
      .select("id, status")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if ((job.status as string) === "completed" || (job.status as string) === "failed") {
      return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 400 });
    }

    await admin
      .from("training_jobs")
      .update({ status: "failed", finished_at: new Date().toISOString(), logs: failReason })
      .eq("id", job_id);

    // Cascade to identity model
    try {
      const model = await getModelForTrainingJob(job_id);
      if (model && model.status !== "ready" && model.status !== "failed") {
        await failModel(model.id, failReason);
        await logJobEvent({
          jobType: "identity_model",
          jobId: model.id,
          event: "failed",
          message: "Cascaded from admin mark-failed on training job",
          meta: { training_job_id: job_id, admin_user: user.id },
        });
      }
    } catch { /* non-fatal */ }

    await logJobEvent({
      jobType: "training",
      jobId: job_id,
      event: "failed",
      message: failReason,
      meta: { admin_user: user.id, source: "admin_mark_failed" },
    });

    await writeAuditLog(admin, {
      actor: user.id,
      actionType: "admin.ops.mark_failed_training_job",
      entityRef: `training_job:${job_id}`,
      beforeJson: { status: job.status },
      afterJson: { status: "failed" },
    });

    return NextResponse.json({ ok: true });
  }

  if (job_type === "identity_model") {
    const { data: model } = await admin
      .from("identity_models")
      .select("id, status")
      .eq("id", job_id)
      .maybeSingle();
    if (!model) return NextResponse.json({ error: "Model not found" }, { status: 404 });
    if ((model.status as string) === "ready" || (model.status as string) === "failed") {
      return NextResponse.json({ error: `Model is already ${model.status}` }, { status: 400 });
    }

    await failModel(job_id, failReason);

    await logJobEvent({
      jobType: "identity_model",
      jobId: job_id,
      event: "failed",
      message: failReason,
      meta: { admin_user: user.id, source: "admin_mark_failed" },
    });

    await writeAuditLog(admin, {
      actor: user.id,
      actionType: "admin.ops.mark_failed_identity_model",
      entityRef: `identity_model:${job_id}`,
      beforeJson: { status: model.status },
      afterJson: { status: "failed", failure_reason: failReason },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported job_type" }, { status: 400 });
}
