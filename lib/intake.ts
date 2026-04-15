/**
 * Training intake constants — single source of truth for upload limits and
 * preprocessing rules across customer upload UI, admin tools, and vault flows.
 *
 * Keep in sync with worker/preprocess_intake.py tunables.
 */

export const MIN_INTAKE_PHOTOS = 15;
export const MAX_INTAKE_PHOTOS = 25;

// Minimum accepted tiles after worker-side preprocessing that training requires
export const MIN_FILTERED_TILES = 12;

export const INTAKE_COPY = {
  title: "Upload training photos",
  subtitle: `Pick ${MIN_INTAKE_PHOTOS}–${MAX_INTAKE_PHOTOS} recent photos of just you.`,
  guidance:
    "Selfies, chest-up, waist-up, and a few full-body shots are ideal. " +
    "Different lighting and backgrounds help. Avoid group photos where possible — " +
    "we will crop you out of group shots when we can. We automatically reject no-face, " +
    "too-small-face, blurry, wrong-person, and near-duplicate images.",
  tooFew: (count: number) =>
    `Add ${MIN_INTAKE_PHOTOS - count} more photo(s). Minimum is ${MIN_INTAKE_PHOTOS}.`,
  tooMany: (count: number) =>
    `Remove ${count - MAX_INTAKE_PHOTOS} photo(s). Maximum is ${MAX_INTAKE_PHOTOS}.`,
  rangeLabel: `${MIN_INTAKE_PHOTOS}–${MAX_INTAKE_PHOTOS}`,
} as const;

export function isIntakeCountValid(count: number): boolean {
  return count >= MIN_INTAKE_PHOTOS && count <= MAX_INTAKE_PHOTOS;
}

/**
 * Canonical rejection reasons emitted by worker preprocessing. Keep in sync with
 * worker/preprocess_intake.py REASON_* constants.
 */
export type IntakeRejectionReason =
  | "NO_FACE"
  | "FACE_TOO_SMALL"
  | "BLURRY"
  | "WRONG_PERSON"
  | "DUPLICATE"
  | "UNUSABLE_ANGLE"
  | "UNREADABLE";

export type IntakeReport = {
  accepted: number;
  auto_fixed: number;
  rejected: number;
  filtered_tiles_total: number;
  dominant_identity_ratio: number;
  reference_embedding_sha1: string | null;
  threshold_used: number;
  min_filtered_tiles_required: number;
  counts_by_rejection_reason: Partial<Record<IntakeRejectionReason, number>>;
  ready_for_training: boolean;
  failure_reason: string | null;
};
