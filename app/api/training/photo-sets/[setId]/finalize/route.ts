import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  getPhotoSet,
  getPhotosInSet,
  assessReadiness,
  updatePhotoSetStatus,
} from "@/lib/training-photo-sets";

/**
 * POST: Mark a validated photo set as ready for training.
 * Checks readiness criteria before allowing finalization.
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

  if (set.status === "ready") {
    return NextResponse.json({ set, message: "Already ready" });
  }

  if (!["uploaded", "validating"].includes(set.status)) {
    return NextResponse.json(
      { error: `Cannot finalize a set with status "${set.status}"` },
      { status: 400 }
    );
  }

  const photos = await getPhotosInSet(setId);
  const readiness = assessReadiness(set, photos);

  if (!readiness.isReady) {
    return NextResponse.json(
      {
        error: "Photo set is not ready for training",
        reasons: readiness.reasons,
        summary: readiness.summary,
      },
      { status: 400 }
    );
  }

  await updatePhotoSetStatus(setId, "ready", {
    quality_score: readiness.summary.approvedRatio * 100,
    validation_summary: readiness.summary as unknown as Record<string, unknown>,
  });

  return NextResponse.json({
    set: { ...set, status: "ready" },
    readiness,
  });
}
