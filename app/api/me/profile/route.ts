import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function isAtLeast18(dob: string): boolean {
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return birth <= cutoff;
}

/** PATCH: Save personal profile info for the current user. */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { full_name?: string; date_of_birth?: string; phone?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const full_name = (body.full_name ?? "").trim();
  const date_of_birth = (body.date_of_birth ?? "").trim();
  const phone = (body.phone ?? "").trim() || null;

  if (!full_name) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  if (!date_of_birth) {
    return NextResponse.json({ error: "Date of birth is required." }, { status: 400 });
  }
  if (!isAtLeast18(date_of_birth)) {
    return NextResponse.json({ error: "You must be at least 18 years old." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("profiles")
    .update({
      full_name,
      date_of_birth,
      phone,
      profile_complete: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message ?? "Failed to save profile." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
