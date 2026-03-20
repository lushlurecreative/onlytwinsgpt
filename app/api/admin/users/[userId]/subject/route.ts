import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Params = { params: Promise<{ userId: string }> };

/**
 * POST: Admin creates an approved subject for a customer who hasn't created one yet.
 * Creates the subject with consent_status='approved' and a subjects_models row.
 */
export async function POST(_req: Request, { params }: Params) {
  const { userId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id, user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Check if subject already exists
  const { data: existing } = await admin
    .from("subjects")
    .select("id, consent_status")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // If exists but not approved, approve it
    if (existing.consent_status !== "approved") {
      await admin
        .from("subjects")
        .update({
          consent_status: "approved",
          consent_signed_at: now,
          identity_verified_at: now,
          updated_at: now,
        })
        .eq("id", existing.id);
    }
    // Ensure subjects_models row exists
    const { data: model } = await admin
      .from("subjects_models")
      .select("id")
      .eq("subject_id", existing.id)
      .maybeSingle();
    if (!model) {
      await admin.from("subjects_models").insert({
        subject_id: existing.id,
        training_status: "pending",
      });
    }
    return NextResponse.json({ subject: { id: existing.id, created: false } }, { status: 200 });
  }

  // Get profile label for the subject
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  const label = (profile?.full_name as string | null) || "Creator";

  const { data: subject, error: subjectError } = await admin
    .from("subjects")
    .insert({
      user_id: userId,
      label,
      consent_status: "approved",
      consent_signed_at: now,
      identity_verified_at: now,
    })
    .select("id")
    .single();

  if (subjectError || !subject) {
    return NextResponse.json({ error: subjectError?.message ?? "Failed to create subject" }, { status: 400 });
  }

  await admin.from("subjects_models").insert({
    subject_id: subject.id,
    training_status: "pending",
  });

  return NextResponse.json({ subject: { id: subject.id, created: true } }, { status: 201 });
}
