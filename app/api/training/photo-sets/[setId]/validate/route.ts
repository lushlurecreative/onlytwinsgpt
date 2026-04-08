import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  getPhotoSet,
  getPhotosInSet,
  updatePhotoSetStatus,
  assessReadiness,
  refreshSetCounts,
} from "@/lib/training-photo-sets";
import { validateTrainingPhotos } from "@/lib/training-photo-validation";

/**
 * POST: Run server-side validation on all photos in a set.
 * Updates each photo's validation_status and the set's overall status.
 */
export async function POST(
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

  // Only validate sets in draft/uploaded/validating state
  if (!["draft", "uploaded", "validating"].includes(set.status)) {
    return NextResponse.json(
      { error: `Cannot validate a set with status "${set.status}"` },
      { status: 400 }
    );
  }

  await updatePhotoSetStatus(setId, "validating");

  const photos = await getPhotosInSet(setId);
  if (photos.length === 0) {
    await updatePhotoSetStatus(setId, "draft");
    return NextResponse.json(
      { error: "No photos to validate" },
      { status: 400 }
    );
  }

  // Run validation on all photos
  const results = await validateTrainingPhotos(photos);

  // Refresh counts after validation updated individual photos
  await refreshSetCounts(setId);

  // Re-fetch updated set and photos
  const updatedSet = await getPhotoSet(setId, user.id);
  const updatedPhotos = await getPhotosInSet(setId);
  const readiness = assessReadiness(updatedSet!, updatedPhotos);

  // Determine final set status
  let finalSetStatus: string;
  if (readiness.isReady) {
    finalSetStatus = "ready";
    // training_photo_sets.quality_score is numeric(4,2) — max value 99.99.
    // approvedRatio*100 yields 100.00 when all photos pass, which overflows
    // and silently fails the entire UPDATE (status would never advance).
    // Round and cap to fit the column.
    const qs = Math.min(99.99, Math.round(readiness.summary.approvedRatio * 10000) / 100);
    await updatePhotoSetStatus(setId, "ready", {
      quality_score: qs,
      validation_summary: readiness.summary as unknown as Record<string, unknown>,
    });
  } else if (readiness.summary.failed > readiness.summary.total * 0.5) {
    finalSetStatus = "rejected";
    await updatePhotoSetStatus(setId, "rejected", {
      validation_summary: {
        ...readiness.summary,
        reasons: readiness.reasons,
      } as unknown as Record<string, unknown>,
    });
  } else {
    // Back to uploaded — user can fix and re-validate
    finalSetStatus = "uploaded";
    await updatePhotoSetStatus(setId, "uploaded", {
      validation_summary: {
        ...readiness.summary,
        reasons: readiness.reasons,
      } as unknown as Record<string, unknown>,
    });
  }

  return NextResponse.json({
    results,
    readiness,
    setStatus: finalSetStatus,
  });
}
