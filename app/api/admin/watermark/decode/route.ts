import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getWatermarkByHash, getWatermarkByHashPrefix } from "@/lib/watermark";
import { getRunPodConfig } from "@/lib/runpod";

/**
 * POST: Admin decode watermark from uploaded image.
 * Upload image -> optional: send to worker for decode -> lookup watermark_logs by hash -> return lead/user/job/tamper.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  let imageBuffer: ArrayBuffer;
  let filename = "upload.jpg";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }
    imageBuffer = await file.arrayBuffer();
    filename = file.name || filename;
  } else if (contentType.includes("application/octet-stream") || contentType.includes("image/")) {
    imageBuffer = await request.arrayBuffer();
  } else {
    return NextResponse.json({ error: "Use multipart/form-data with image file" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const tempPath = `temp/decode-${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`;
  const { error: uploadError } = await admin.storage.from("uploads").upload(tempPath, imageBuffer, {
    contentType: contentType.includes("multipart") ? "image/jpeg" : "application/octet-stream",
    upsert: true,
  });
  if (uploadError) {
    return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
  }
  const { data: urlData } = admin.storage.from("uploads").getPublicUrl(tempPath);
  const imageUrl = urlData.publicUrl;

  const config = await getRunPodConfig();
  if (config) {
    try {
      const res = await fetch(`https://api.runpod.ai/v2/${config.endpointId}/runsync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            type: "decode_watermark",
            image_url: imageUrl,
          },
        }),
      });
      if (res.ok) {
        const result = (await res.json()) as { output?: { status?: string; output?: { watermark_hash?: string; tamper_status?: string }; watermark_hash?: string; tamper_status?: string } };
        const out = result.output?.output ?? result.output;
        if (out?.watermark_hash) {
          const log =
            out.watermark_hash.length >= 64
              ? await getWatermarkByHash(out.watermark_hash)
              : await getWatermarkByHashPrefix(out.watermark_hash);
          await admin.storage.from("uploads").remove([tempPath]);
          return NextResponse.json({
            found: !!log,
            watermark_hash: out.watermark_hash,
            tamper_status: out.tamper_status ?? null,
            log: log
              ? {
                  asset_type: log.asset_type,
                  lead_id: log.lead_id,
                  user_id: log.user_id,
                  generation_job_id: log.generation_job_id,
                  asset_path: log.asset_path,
                  embedded_at: log.embedded_at,
                }
              : null,
          });
        }
      }
    } catch (e) {
      await admin.storage.from("uploads").remove([tempPath]).catch(() => {});
      return NextResponse.json(
        { error: "Worker decode failed", detail: e instanceof Error ? e.message : String(e) },
        { status: 502 }
      );
    }
  }

  await admin.storage.from("uploads").remove([tempPath]).catch(() => {});
  return NextResponse.json({
    error: "Decode requires RunPod worker with decode_watermark support. Upload saved; add worker support and retry.",
    temp_path: tempPath,
  });
}
