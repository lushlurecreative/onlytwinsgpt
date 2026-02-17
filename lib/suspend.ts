/**
 * Suspend check: read app_settings suspended_user_ids (comma-separated UUIDs).
 * Use in critical routes (checkout, generation, vault) to block suspended users.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function isUserSuspended(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "suspended_user_ids").maybeSingle();
  const raw = (data?.value as string) ?? "";
  const ids = raw.split(",").map((id) => id.trim()).filter(Boolean);
  return ids.includes(userId);
}
