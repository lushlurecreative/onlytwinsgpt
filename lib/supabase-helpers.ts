/**
 * Supabase storage helpers for homepage preview flow.
 * Handles uploading user-provided images to uploads bucket.
 */

import { supabase } from "@/lib/supabase";

/**
 * Upload a blob (from file input) to Supabase uploads bucket.
 * Returns public URL or null on failure.
 * Retries up to 3 times with exponential backoff on network errors.
 */
export async function uploadImageToSupabase(
  blob: Blob,
  fileName: string,
  maxRetries: number = 3
): Promise<{ url: string | null; error?: string }> {
  // Validate file size (max 10MB)
  const maxSizeBytes = 10 * 1024 * 1024;
  if (blob.size > maxSizeBytes) {
    const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
    return {
      url: null,
      error: `File too large (${sizeMb}MB). Max 10MB allowed.`,
    };
  }

  // Validate file type
  if (!blob.type.startsWith("image/")) {
    return {
      url: null,
      error: `Invalid file type. Expected image, got ${blob.type}`,
    };
  }

  let lastError = "";
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Generate unique path to avoid collisions
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      const uniqueName = `${timestamp}_${randomSuffix}_${fileName}`;
      const storagePath = `preview-uploads/${uniqueName}`;

      // Upload to uploads bucket
      const { error } = await supabase.storage
        .from("uploads")
        .upload(storagePath, blob, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        lastError = error.message;
        console.warn(`Upload attempt ${attempt}/${maxRetries} failed: ${error.message}`);

        // Retry on network errors, give up on 4xx errors
        if (
          attempt < maxRetries &&
          (error.message.includes("network") ||
            error.message.includes("timeout") ||
            error.message.includes("ECONNRESET"))
        ) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        return { url: null, error: error.message };
      }

      // Construct public URL
      const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      if (!supabaseUrl) {
        return {
          url: null,
          error: "Supabase URL not configured",
        };
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/uploads/${storagePath}`;
      return { url: publicUrl };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(
        `Upload attempt ${attempt}/${maxRetries} exception:`,
        lastError
      );

      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  return {
    url: null,
    error: lastError || "Upload failed after multiple retries",
  };
}

/**
 * Convert blob URL (from file input) to actual Blob object.
 * Used for uploading selected files to storage.
 */
export async function blobUrlToBlob(blobUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(blobUrl);
    return await response.blob();
  } catch (error) {
    console.error("blobUrlToBlob error:", error);
    return null;
  }
}
