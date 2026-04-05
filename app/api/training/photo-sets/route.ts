import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getOrCreateActivePhotoSet,
  getPhotosInSet,
  assessReadiness,
} from "@/lib/training-photo-sets";
import type { TrainingPhotoSet } from "@/lib/training-photo-sets";

/**
 * GET: Return the user's active photo set with photos and readiness assessment.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const set = await getOrCreateActivePhotoSet(user.id);
  const photos = await getPhotosInSet(set.id);
  const readiness = assessReadiness(set, photos);

  // Generate signed URLs for photo previews
  const admin = getSupabaseAdmin();
  const photosWithUrls = await Promise.all(
    photos.map(async (photo) => {
      const { data: signedData } = await admin.storage
        .from("uploads")
        .createSignedUrl(photo.storage_path, 3600);
      return {
        ...photo,
        signedUrl: signedData?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({
    set,
    photos: photosWithUrls,
    readiness,
  });
}

/**
 * POST: Create a new photo set (only if no active set exists).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check for existing active set
  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("training_photo_sets")
    .select("id, status")
    .eq("user_id", user.id)
    .not("status", "in", '("trained","failed","rejected")')
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Active photo set already exists", set: existing as TrainingPhotoSet },
      { status: 409 }
    );
  }

  const set = await getOrCreateActivePhotoSet(user.id);
  return NextResponse.json({ set }, { status: 201 });
}
