/**
 * Creator vs Consumer roles. Profiles.role: 'creator' | 'consumer' (default 'consumer').
 * Creator-only: /vault, /creator, /upload (and generation/training flows).
 * Consumer: feed, subscribe, view creator content.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type UserRole = "creator" | "consumer";

export async function getUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRole> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const role = (data?.role as string)?.trim().toLowerCase();
  if (role === "creator") return "creator";
  return "consumer";
}

export async function setUserRole(
  supabase: SupabaseClient,
  userId: string,
  role: UserRole
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function isSuspended(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("suspended_at")
    .eq("id", userId)
    .maybeSingle();
  return !!data?.suspended_at;
}
