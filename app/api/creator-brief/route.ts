import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

type BriefRow = {
  id: string;
  user_id: string;
  handle: string;
  niche: string;
  goals: string;
  signature_style: string;
  physical_constants: string;
  dream_scenes: string;
  created_at: string;
  updated_at: string;
};

type BriefBody = {
  handle?: string;
  niche?: string;
  goals?: string;
  signatureStyle?: string;
  physicalConstants?: string;
  dreamScenes?: string;
};

function requireText(value: unknown, field: string) {
  if (typeof value !== "string") {
    return { ok: false as const, error: `${field} is required` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false as const, error: `${field} is required` };
  }
  if (trimmed.length > 2000) {
    return { ok: false as const, error: `${field} is too long` };
  }
  return { ok: true as const, value: trimmed };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("creator_briefs")
    .select(
      "id, user_id, handle, niche, goals, signature_style, physical_constants, dream_scenes, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ brief: (data as unknown as BriefRow | null) ?? null }, { status: 200 });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: BriefBody = {};
  try {
    body = (await request.json()) as BriefBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const handle = requireText(body.handle, "handle");
  if (!handle.ok) return NextResponse.json({ error: handle.error }, { status: 400 });
  const niche = requireText(body.niche, "niche");
  if (!niche.ok) return NextResponse.json({ error: niche.error }, { status: 400 });
  const goals = requireText(body.goals, "goals");
  if (!goals.ok) return NextResponse.json({ error: goals.error }, { status: 400 });
  const signatureStyle = requireText(body.signatureStyle, "signatureStyle");
  if (!signatureStyle.ok) return NextResponse.json({ error: signatureStyle.error }, { status: 400 });
  const physicalConstants = requireText(body.physicalConstants, "physicalConstants");
  if (!physicalConstants.ok) return NextResponse.json({ error: physicalConstants.error }, { status: 400 });
  const dreamScenes = requireText(body.dreamScenes, "dreamScenes");
  if (!dreamScenes.ok) return NextResponse.json({ error: dreamScenes.error }, { status: 400 });

  const { data, error } = await supabase
    .from("creator_briefs")
    .upsert(
      {
        user_id: user.id,
        handle: handle.value,
        niche: niche.value,
        goals: goals.value,
        signature_style: signatureStyle.value,
        physical_constants: physicalConstants.value,
        dream_scenes: dreamScenes.value,
      },
      { onConflict: "user_id" }
    )
    .select(
      "id, user_id, handle, niche, goals, signature_style, physical_constants, dream_scenes, created_at, updated_at"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ brief: data as unknown as BriefRow }, { status: 200 });
}

