import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "uploads";
const FILE_NAME = "request-preferences.json";

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
    return NextResponse.json({ preferences: null }, { status: 200 });
  }

  const text = await data.text();
  try {
    return NextResponse.json({ preferences: JSON.parse(text) }, { status: 200 });
  } catch {
    return NextResponse.json({ preferences: null }, { status: 200 });
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

  return NextResponse.json({ ok: true }, { status: 200 });
}
