import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type PhotoSetStatus =
  | "draft"
  | "uploaded"
  | "validating"
  | "ready"
  | "rejected"
  | "training"
  | "trained"
  | "failed";

export type PhotoValidationStatus = "pending" | "passed" | "warned" | "failed";

export interface TrainingPhotoSet {
  id: string;
  user_id: string;
  status: PhotoSetStatus;
  photo_count: number;
  approved_count: number;
  rejected_count: number;
  cover_image_path: string | null;
  notes: string | null;
  quality_score: number | null;
  validation_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingPhoto {
  id: string;
  photo_set_id: string;
  user_id: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  face_count: number | null;
  quality_score: number | null;
  is_blurry: boolean | null;
  is_duplicate: boolean | null;
  has_occlusion: boolean | null;
  pose_bucket: string | null;
  validation_status: PhotoValidationStatus;
  validation_notes: string | null;
  approved: boolean | null;
  rejection_reason: string | null;
  created_at: string;
}

const MIN_PHOTOS = 10;
const MAX_PHOTOS = 50;
const MIN_APPROVED_RATIO = 0.6;

/**
 * Get or create the active (non-terminal) photo set for a user.
 * Terminal statuses: trained, failed, rejected — these sets are done.
 * A user should only have one active set at a time.
 */
export async function getOrCreateActivePhotoSet(
  userId: string
): Promise<TrainingPhotoSet> {
  const admin = getSupabaseAdmin();

  // Find most recent non-terminal set
  const { data: existing } = await admin
    .from("training_photo_sets")
    .select("*")
    .eq("user_id", userId)
    .not("status", "in", '("trained","failed","rejected")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as TrainingPhotoSet;

  // Create a new draft set
  const { data: created, error } = await admin
    .from("training_photo_sets")
    .insert({ user_id: userId, status: "draft" })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create photo set: ${error.message}`);
  return created as TrainingPhotoSet;
}

/**
 * Get a specific photo set by ID, verifying ownership.
 */
export async function getPhotoSet(
  setId: string,
  userId: string
): Promise<TrainingPhotoSet | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("training_photo_sets")
    .select("*")
    .eq("id", setId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as TrainingPhotoSet) ?? null;
}

/**
 * Get all photos in a photo set.
 */
export async function getPhotosInSet(
  setId: string
): Promise<TrainingPhoto[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("training_photos")
    .select("*")
    .eq("photo_set_id", setId)
    .order("created_at", { ascending: true });
  return (data ?? []) as TrainingPhoto[];
}

/**
 * Add a photo record to a set after upload.
 */
export async function addPhotoToSet(
  setId: string,
  userId: string,
  storagePath: string,
  originalFilename: string | null,
  mimeType: string,
  fileSize: number | null
): Promise<TrainingPhoto> {
  const admin = getSupabaseAdmin();

  const { data: photo, error } = await admin
    .from("training_photos")
    .insert({
      photo_set_id: setId,
      user_id: userId,
      storage_path: storagePath,
      original_filename: originalFilename,
      mime_type: mimeType,
      file_size: fileSize,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to add photo: ${error.message}`);

  // Update set counts
  await refreshSetCounts(setId);

  return photo as TrainingPhoto;
}

/**
 * Remove a photo record from a set.
 */
export async function removePhotoFromSet(
  storagePath: string,
  userId: string
): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: photo } = await admin
    .from("training_photos")
    .select("id, photo_set_id")
    .eq("storage_path", storagePath)
    .eq("user_id", userId)
    .maybeSingle();

  if (!photo) return;

  await admin.from("training_photos").delete().eq("id", photo.id);
  await refreshSetCounts(photo.photo_set_id);
}

/**
 * Refresh the aggregate counts on a photo set.
 */
export async function refreshSetCounts(setId: string): Promise<void> {
  const admin = getSupabaseAdmin();

  const { data: photos } = await admin
    .from("training_photos")
    .select("validation_status, approved")
    .eq("photo_set_id", setId);

  const all = photos ?? [];
  const photoCount = all.length;
  const approvedCount = all.filter(
    (p: { validation_status: string; approved: boolean | null }) =>
      p.validation_status === "passed" || p.approved === true
  ).length;
  const rejectedCount = all.filter(
    (p: { validation_status: string; approved: boolean | null }) =>
      p.validation_status === "failed" || p.approved === false
  ).length;

  // Set cover image from first photo
  const { data: firstPhoto } = await admin
    .from("training_photos")
    .select("storage_path")
    .eq("photo_set_id", setId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Auto-set status based on counts
  let statusUpdate: PhotoSetStatus | null = null;
  const { data: currentSet } = await admin
    .from("training_photo_sets")
    .select("status")
    .eq("id", setId)
    .single();

  const currentStatus = (currentSet?.status ?? "draft") as PhotoSetStatus;
  // Only auto-transition from draft/uploaded based on photo count
  if (currentStatus === "draft" && photoCount > 0) {
    statusUpdate = "uploaded";
  } else if (currentStatus === "uploaded" && photoCount === 0) {
    statusUpdate = "draft";
  }

  await admin
    .from("training_photo_sets")
    .update({
      photo_count: photoCount,
      approved_count: approvedCount,
      rejected_count: rejectedCount,
      cover_image_path: (firstPhoto as { storage_path: string } | null)?.storage_path ?? null,
      ...(statusUpdate ? { status: statusUpdate } : {}),
    })
    .eq("id", setId);
}

/**
 * Assess whether a photo set is ready for training.
 */
export function assessReadiness(set: TrainingPhotoSet, photos: TrainingPhoto[]): {
  isReady: boolean;
  reasons: string[];
  summary: {
    total: number;
    passed: number;
    warned: number;
    failed: number;
    pending: number;
    approvedRatio: number;
  };
} {
  const reasons: string[] = [];
  const total = photos.length;
  const passed = photos.filter((p) => p.validation_status === "passed").length;
  const warned = photos.filter((p) => p.validation_status === "warned").length;
  const failed = photos.filter((p) => p.validation_status === "failed").length;
  const pending = photos.filter((p) => p.validation_status === "pending").length;
  const usable = passed + warned; // warned photos are usable but not ideal
  const approvedRatio = total > 0 ? usable / total : 0;

  if (total < MIN_PHOTOS) {
    reasons.push(`Need at least ${MIN_PHOTOS} photos (have ${total})`);
  }
  if (total > MAX_PHOTOS) {
    reasons.push(`Maximum ${MAX_PHOTOS} photos allowed (have ${total})`);
  }
  if (pending > 0) {
    reasons.push(`${pending} photo${pending === 1 ? "" : "s"} still pending validation`);
  }
  if (usable < MIN_PHOTOS) {
    reasons.push(
      `Need at least ${MIN_PHOTOS} usable photos (have ${usable} passed/warned)`
    );
  }
  if (approvedRatio < MIN_APPROVED_RATIO && total >= MIN_PHOTOS) {
    reasons.push(
      `At least ${Math.round(MIN_APPROVED_RATIO * 100)}% of photos must pass validation (currently ${Math.round(approvedRatio * 100)}%)`
    );
  }

  const isReady =
    total >= MIN_PHOTOS &&
    total <= MAX_PHOTOS &&
    usable >= MIN_PHOTOS &&
    pending === 0 &&
    approvedRatio >= MIN_APPROVED_RATIO;

  return {
    isReady,
    reasons,
    summary: { total, passed, warned, failed, pending, approvedRatio },
  };
}

/**
 * Update photo set status.
 */
export async function updatePhotoSetStatus(
  setId: string,
  status: PhotoSetStatus,
  extra?: { quality_score?: number; validation_summary?: Record<string, unknown> }
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("training_photo_sets")
    .update({ status, ...extra })
    .eq("id", setId);
}

/**
 * Get the list of approved storage paths from a photo set for training.
 */
export async function getTrainablePathsFromSet(setId: string): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("training_photos")
    .select("storage_path")
    .eq("photo_set_id", setId)
    .in("validation_status", ["passed", "warned"])
    .order("created_at", { ascending: true });

  return (data ?? []).map((p: { storage_path: string }) => p.storage_path);
}
