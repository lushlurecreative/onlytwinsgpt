/**
 * Supabase storage helpers for homepage preview flow.
 * Handles uploading user-provided images to uploads bucket.
 */

import { createClient } from "@/lib/supabase-browser";

/**
 * Upload a blob (from file input) to Supabase uploads bucket.
 * Returns public URL or null on failure.
 */
export async function uploadImageToSupabase(
  blob: Blob,
  fileName: string
): Promise<string | null> {
  try {
    const supabase = createClient();

    // Generate unique path to avoid collisions
    const timestamp = Date.now();
    const uniqueName = `${timestamp}_${fileName}`;
    const storagePath = `preview-uploads/${uniqueName}`;

    // Upload to uploads bucket
    const { error } = await supabase.storage
      .from("uploads")
      .upload(storagePath, blob, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error(`Upload error: ${error.message}`);
      return null;
    }

    // Construct public URL
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      console.error("Supabase URL not configured");
      return null;
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/uploads/${storagePath}`;
    return publicUrl;
  } catch (error) {
    console.error(
      "uploadImageToSupabase error:",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
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
