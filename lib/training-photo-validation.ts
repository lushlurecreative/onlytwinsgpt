import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { logInfo, logWarn } from "@/lib/observability";
import type { TrainingPhoto } from "@/lib/training-photo-sets";

// Validation thresholds
const MIN_WIDTH = 512;
const MIN_HEIGHT = 512;
const MIN_FILE_SIZE = 50 * 1024; // 50 KB
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const IDEAL_MIN_WIDTH = 768;
const IDEAL_MIN_HEIGHT = 768;

export interface PhotoValidationResult {
  photoId: string;
  storagePath: string;
  validation_status: "passed" | "warned" | "failed";
  validation_notes: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  issues: string[];
  warnings: string[];
}

/**
 * Validate all photos in a training set.
 * Updates each photo's validation fields in the database.
 */
export async function validateTrainingPhotos(
  photos: TrainingPhoto[]
): Promise<PhotoValidationResult[]> {
  const admin = getSupabaseAdmin();
  const results: PhotoValidationResult[] = [];
  const seenPaths = new Set<string>();

  for (const photo of photos) {
    const issues: string[] = [];
    const warnings: string[] = [];
    let width = photo.width;
    let height = photo.height;
    let fileSize = photo.file_size;

    // 1. Fetch image metadata from storage if we don't have dimensions
    if (!width || !height || !fileSize) {
      try {
        const dims = await getImageMetadata(photo.storage_path);
        width = dims.width;
        height = dims.height;
        fileSize = dims.fileSize;
      } catch (err) {
        issues.push("Could not read image metadata");
        logWarn("photo_validation_metadata_error", {
          photoId: photo.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. File size checks
    if (fileSize !== null) {
      if (fileSize < MIN_FILE_SIZE) {
        issues.push(
          `File too small (${Math.round(fileSize / 1024)}KB) — minimum ${Math.round(MIN_FILE_SIZE / 1024)}KB`
        );
      }
      if (fileSize > MAX_FILE_SIZE) {
        issues.push(
          `File too large (${Math.round(fileSize / (1024 * 1024))}MB) — maximum ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`
        );
      }
    }

    // 3. Dimension checks
    if (width !== null && height !== null) {
      if (width < MIN_WIDTH || height < MIN_HEIGHT) {
        issues.push(
          `Resolution too low (${width}x${height}) — minimum ${MIN_WIDTH}x${MIN_HEIGHT}`
        );
      } else if (width < IDEAL_MIN_WIDTH || height < IDEAL_MIN_HEIGHT) {
        warnings.push(
          `Resolution below ideal (${width}x${height}) — recommended ${IDEAL_MIN_WIDTH}x${IDEAL_MIN_HEIGHT}+`
        );
      }

      // Extreme aspect ratios are problematic for training
      const aspectRatio = Math.max(width, height) / Math.min(width, height);
      if (aspectRatio > 3) {
        issues.push(
          `Extreme aspect ratio (${aspectRatio.toFixed(1)}:1) — likely a banner or strip, not a portrait`
        );
      } else if (aspectRatio > 2) {
        warnings.push(
          `Wide aspect ratio (${aspectRatio.toFixed(1)}:1) — may crop poorly for training`
        );
      }
    }

    // 4. MIME type check
    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowedMimes.includes(photo.mime_type)) {
      issues.push(`Unsupported format (${photo.mime_type}) — use JPEG, PNG, or WEBP`);
    }

    // 5. Duplicate detection (by storage path — exact duplicates)
    const isDuplicate = seenPaths.has(photo.storage_path);
    if (isDuplicate) {
      issues.push("Duplicate photo detected");
    }
    seenPaths.add(photo.storage_path);

    // Determine overall status
    let validationStatus: "passed" | "warned" | "failed";
    if (issues.length > 0) {
      validationStatus = "failed";
    } else if (warnings.length > 0) {
      validationStatus = "warned";
    } else {
      validationStatus = "passed";
    }

    const allNotes = [...issues, ...warnings].join("; ");

    // Update photo record in database
    await admin
      .from("training_photos")
      .update({
        width,
        height,
        file_size: fileSize,
        validation_status: validationStatus,
        validation_notes: allNotes || null,
        is_duplicate: isDuplicate,
        approved: validationStatus !== "failed" ? true : false,
      })
      .eq("id", photo.id);

    results.push({
      photoId: photo.id,
      storagePath: photo.storage_path,
      validation_status: validationStatus,
      validation_notes: allNotes,
      width,
      height,
      file_size: fileSize,
      issues,
      warnings,
    });
  }

  logInfo("training_photos_validation_complete", {
    total: results.length,
    passed: results.filter((r) => r.validation_status === "passed").length,
    warned: results.filter((r) => r.validation_status === "warned").length,
    failed: results.filter((r) => r.validation_status === "failed").length,
  });

  return results;
}

/**
 * Read image dimensions and file size from storage.
 * Uses a signed URL with Range header to only download the first 64KB for dimension parsing.
 * File size comes from a HEAD request or the full metadata.
 */
async function getImageMetadata(
  storagePath: string
): Promise<{ width: number | null; height: number | null; fileSize: number | null }> {
  const admin = getSupabaseAdmin();

  // Create a signed URL to fetch partial content
  const { data: signedData, error: signedError } = await admin.storage
    .from("uploads")
    .createSignedUrl(storagePath, 300);

  if (signedError || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL for ${storagePath}: ${signedError?.message ?? "no URL"}`);
  }

  const url = signedData.signedUrl;
  let fileSize: number | null = null;
  let buffer: Uint8Array;

  try {
    // Fetch only first 64KB for header parsing
    const response = await fetch(url, {
      headers: { Range: "bytes=0-65535" },
    });

    // Get file size from Content-Range header (format: "bytes 0-65535/total")
    const contentRange = response.headers.get("content-range");
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/);
      if (match) fileSize = parseInt(match[1], 10);
    }

    // If server doesn't support Range, we get the full file — still works
    if (!fileSize) {
      const contentLength = response.headers.get("content-length");
      if (contentLength) fileSize = parseInt(contentLength, 10);
    }

    const arrayBuf = await response.arrayBuffer();
    buffer = new Uint8Array(arrayBuf);

    // If we got the full file (no range support), use its length as file size
    if (!fileSize) fileSize = buffer.byteLength;
  } catch (fetchErr) {
    throw new Error(
      `Failed to fetch headers for ${storagePath}: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`
    );
  }

  const dims = readImageDimensions(buffer);

  return {
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    fileSize,
  };
}

/**
 * Read image dimensions from raw bytes (JPEG, PNG, WEBP).
 * Avoids needing sharp or other native dependencies.
 */
function readImageDimensions(
  buffer: Uint8Array
): { width: number; height: number } | null {
  if (buffer.length < 24) return null;

  // PNG: bytes 16-23 contain width and height as 4-byte big-endian
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const width =
      (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
    const height =
      (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];
    return { width, height };
  }

  // JPEG: scan for SOF markers (0xFFC0-0xFFC3)
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // SOF markers: C0, C1, C2, C3
      if (marker >= 0xc0 && marker <= 0xc3) {
        const height = (buffer[offset + 5] << 8) | buffer[offset + 6];
        const width = (buffer[offset + 7] << 8) | buffer[offset + 8];
        return { width, height };
      }
      // Skip marker segment
      const segmentLength = (buffer[offset + 2] << 8) | buffer[offset + 3];
      offset += 2 + segmentLength;
    }
    return null;
  }

  // WEBP: RIFF header, then VP8 chunk
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    // VP8 lossy
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x20) {
      // VP8 bitstream: width at offset 26-27, height at 28-29 (little-endian, 14 bits each)
      if (buffer.length > 29) {
        const width = ((buffer[26] | (buffer[27] << 8)) & 0x3fff);
        const height = ((buffer[28] | (buffer[29] << 8)) & 0x3fff);
        return { width, height };
      }
    }
    // VP8L lossless
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x4c) {
      if (buffer.length > 24) {
        const b0 = buffer[21];
        const b1 = buffer[22];
        const b2 = buffer[23];
        const b3 = buffer[24];
        const width = 1 + (((b1 & 0x3f) << 8) | b0);
        const height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 >> 6) & 0x3));
        return { width, height };
      }
    }
    // VP8X extended
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x58) {
      if (buffer.length > 29) {
        const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
        const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
        return { width, height };
      }
    }
  }

  return null;
}
