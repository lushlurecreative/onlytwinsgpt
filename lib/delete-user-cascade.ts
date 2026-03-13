/**
 * Full cascade delete for a user (auth.users id = profiles id).
 * Call only from admin routes. Does not delete the admin account.
 * Order chosen to satisfy FKs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_EMAILS_KEY = "ADMIN_OWNER_EMAILS";
const DEFAULT_ADMIN_EMAIL = "lush.lure.creative@gmail.com";

function getAdminEmails(): Set<string> {
  const raw = process.env[ADMIN_EMAILS_KEY] ?? DEFAULT_ADMIN_EMAIL;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isProtectedAdminEmail(email: string | null): boolean {
  if (!email?.trim()) return false;
  return getAdminEmails().has(email.trim().toLowerCase());
}

export async function deleteUserCompletely(
  admin: SupabaseClient,
  userId: string,
  userEmail: string | null,
  authAdmin: { deleteUser: (id: string) => Promise<{ error: unknown }> }
): Promise<{ ok: true } | { error: string }> {
  if (isProtectedAdminEmail(userEmail)) {
    return { error: "Cannot delete admin account." };
  }

  const emailLower = (userEmail ?? "").trim().toLowerCase();

  // 1) admin_payment_links (rows where this user's email is the prospect)
  if (emailLower) {
    await admin.from("admin_payment_links").delete().eq("email", emailLower);
  }

  // 2) subscriptions where user is subscriber
  await admin.from("subscriptions").delete().eq("subscriber_id", userId);

  // 3) usage_ledger
  await admin.from("usage_ledger").delete().eq("user_id", userId);

  // 4) Get user's generation_request ids and subject ids for cascades
  const { data: reqRows } = await admin
    .from("generation_requests")
    .select("id")
    .eq("user_id", userId);
  const requestIds = (reqRows ?? []).map((r) => (r as { id: string }).id);

  const { data: subjRows } = await admin.from("subjects").select("id").eq("user_id", userId);
  const subjectIds = (subjRows ?? []).map((s) => (s as { id: string }).id);

  // 5) generation_jobs (linked to user's requests or subjects)
  if (requestIds.length > 0) {
    await admin.from("generation_jobs").delete().in("generation_request_id", requestIds);
  }
  if (subjectIds.length > 0) {
    await admin.from("generation_jobs").delete().in("subject_id", subjectIds);
  }

  // 6) generation_request_lines (cascade when we delete requests; delete explicitly to be safe)
  if (requestIds.length > 0) {
    await admin.from("generation_request_lines").delete().in("generation_request_id", requestIds);
  }

  // 7) generation_requests
  await admin.from("generation_requests").delete().eq("user_id", userId);

  // 8) recurring_request_mixes
  await admin.from("recurring_request_mixes").delete().eq("user_id", userId);

  // 9) user_notifications
  await admin.from("user_notifications").delete().eq("user_id", userId);

  // 10) creator_briefs
  await admin.from("creator_briefs").delete().eq("user_id", userId);

  // 11) revenue_events
  await admin.from("revenue_events").delete().eq("user_id", userId);

  // 12) training_jobs (subject_id in user's subjects)
  if (subjectIds.length > 0) {
    await admin.from("training_jobs").delete().in("subject_id", subjectIds);
  }

  // 13) subjects_models (subject_id in user's subjects)
  if (subjectIds.length > 0) {
    await admin.from("subjects_models").delete().in("subject_id", subjectIds);
  }

  // 14) subjects
  await admin.from("subjects").delete().eq("user_id", userId);

  // 15) posts (creator_id = user)
  await admin.from("posts").delete().eq("creator_id", userId);

  // 16) profiles
  await admin.from("profiles").delete().eq("id", userId);

  // 17) auth
  const { error } = await authAdmin.deleteUser(userId);
  if (error) {
    return { error: (error as { message?: string })?.message ?? "Failed to delete auth user." };
  }
  return { ok: true };
}
