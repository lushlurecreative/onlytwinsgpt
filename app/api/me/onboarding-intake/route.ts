import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "uploads";
const FILE_NAME = "onboarding-intake.json";

async function getUserId() {
  const session = await createClient();
  const {
    data: { user },
    error,
  } = await session.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const objectPath = `${userId}/state/${FILE_NAME}`;
  const { data, error } = await admin.storage.from(BUCKET).download(objectPath);
  if (error || !data) {
    return NextResponse.json({ intake: null }, { status: 200 });
  }

  const text = await data.text();
  try {
    return NextResponse.json({ intake: JSON.parse(text) }, { status: 200 });
  } catch {
    return NextResponse.json({ intake: null }, { status: 200 });
  }
}

export async function PUT(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const admin = getSupabaseAdmin();
  const objectPath = `${userId}/state/${FILE_NAME}`;
  const serialized = JSON.stringify({
    ...body,
    updatedAt: new Date().toISOString(),
  });

  const { error } = await admin.storage.from(BUCKET).upload(objectPath, serialized, {
    upsert: true,
    contentType: "application/json",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Ensure the user has an approved `subjects` row so the rest of the
  // training pipeline (POST /api/training → getApprovedSubjectIdForUser)
  // can find them. Saving the intake is the customer's consent moment.
  // Idempotent: only inserts if no approved subject already exists.
  try {
    const { data: existing } = await admin
      .from("subjects")
      .select("id")
      .eq("user_id", userId)
      .eq("consent_status", "approved")
      .limit(1)
      .maybeSingle();
    if (!existing) {
      const label =
        typeof body.name === "string" && body.name.trim().length > 0
          ? (body.name as string).trim()
          : "Primary subject";
      await admin.from("subjects").insert({
        user_id: userId,
        label,
        consent_status: "approved",
        consent_signed_at: new Date().toISOString(),
      });
    }
  } catch {
    // Non-fatal — intake save still succeeds. The user can hit /api/training
    // later and the gate will surface the subject-missing error if it failed.
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
