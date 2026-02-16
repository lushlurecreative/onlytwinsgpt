import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import {
  detectMimeTypeFromBytes,
  isAllowedMimeType,
  sanitizeFilename,
} from "@/lib/upload-security";
import { logError, logWarn } from "@/lib/observability";
import { getMaxUploadBytes, RATE_LIMITS } from "@/lib/security-config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = getClientIpFromHeaders(request.headers);
    const rl = checkRateLimit(
      `upload:${ip}`,
      RATE_LIMITS.uploads.limit,
      RATE_LIMITS.uploads.windowMs
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many upload requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const maxUploadBytes = getMaxUploadBytes();
    if (fileValue.size > maxUploadBytes) {
      return NextResponse.json(
        {
          error: `File too large. Max allowed is ${Math.floor(maxUploadBytes / (1024 * 1024))}MB.`,
        },
        { status: 413 }
      );
    }

    const declaredMime = fileValue.type || "application/octet-stream";
    if (!isAllowedMimeType(declaredMime)) {
      return NextResponse.json(
        { error: "Unsupported file type. Allowed: JPEG, PNG, WEBP, GIF." },
        { status: 400 }
      );
    }

    const fileBuffer = new Uint8Array(await fileValue.arrayBuffer());
    const sniffedMime = detectMimeTypeFromBytes(fileBuffer);
    if (!sniffedMime) {
      return NextResponse.json(
        { error: "Unable to validate file signature. Please upload a supported image." },
        { status: 400 }
      );
    }

    if (sniffedMime !== declaredMime) {
      logWarn("upload_mime_mismatch", {
        userId: user.id,
        declaredMime,
        sniffedMime,
        fileName: fileValue.name,
      });
      return NextResponse.json({ error: "File MIME type does not match file content." }, { status: 400 });
    }

    const safeName = sanitizeFilename(fileValue.name);
    const objectPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(objectPath, fileBuffer, {
        upsert: false,
        contentType: sniffedMime,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from("uploads")
      .createSignedUrl(objectPath, 60);

    if (signedError) {
      return NextResponse.json({ error: signedError.message }, { status: 400 });
    }

    return NextResponse.json(
      { objectPath, signedUrl: signedData?.signedUrl ?? null },
      { status: 200 }
    );
  } catch (error) {
    logError("upload_route_unhandled_error", error);
    return NextResponse.json({ error: "Unexpected upload error" }, { status: 500 });
  }
}

