import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getPhotoSet,
  getPhotosInSet,
  assessReadiness,
} from "@/lib/training-photo-sets";

/**
 * GET: Return a specific photo set with all photos and readiness info.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ setId: string }> }
) {
  const { setId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const set = await getPhotoSet(setId, user.id);
  if (!set) {
    return NextResponse.json({ error: "Photo set not found" }, { status: 404 });
  }

  const photos = await getPhotosInSet(set.id);
  const readiness = assessReadiness(set, photos);

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
