import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import Replicate from "replicate";

const VERTICAL_KEYWORDS: Record<string, string[]> = {
  swimwear: ["swimwear", "bikini", "swimsuit", "beach", "pool", "bathing"],
  lingerie: ["lingerie", "underwear", "bra", "boudoir", "intimates"],
  fashion: ["fashion", "dress", "outfit", "modeling", "style"],
  lifestyle: ["lifestyle", "casual", "relaxing", "home", "outdoor"],
  fitness: ["fitness", "gym", "workout", "athletic", "sports"],
};

function extractVerticals(description: string): string[] {
  const lower = description.toLowerCase();
  const found: string[] = [];
  for (const [vertical, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      found.push(vertical);
    }
  }
  return [...new Set(found)];
}

type Params = { params: Promise<{ leadId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { leadId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "REPLICATE_API_TOKEN not set. Image classification requires Replicate." },
      { status: 503 }
    );
  }

  const admin = getSupabaseAdmin();
  const { data: lead, error } = await admin
    .from("leads")
    .select("id, sample_paths")
    .eq("id", leadId)
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const samplePaths = (lead.sample_paths ?? []) as string[];
  if (samplePaths.length === 0) {
    return NextResponse.json({ error: "No sample images to classify" }, { status: 400 });
  }

  const { data: signed } = await admin.storage
    .from("uploads")
    .createSignedUrl(samplePaths[0], 300);
  const imageUrl = signed?.signedUrl;
  if (!imageUrl) {
    return NextResponse.json({ error: "Could not get image URL" }, { status: 400 });
  }

  let contentVerticals: string[] = [];
  try {
    const replicate = new Replicate({ auth: token });
    const output = (await replicate.run("yorickvp/llava-13b", {
      input: {
        image: imageUrl,
        prompt:
          "Describe this image in one short sentence. Focus only on: what the person is wearing (swimwear, bikini, lingerie, casual clothes, fitness wear, etc) and the setting.",
        max_tokens: 100,
      },
    })) as string | string[];

    const description = Array.isArray(output) ? output.join(" ") : String(output ?? "");
    contentVerticals = extractVerticals(description);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Classification failed: ${msg}` }, { status: 500 });
  }

  await admin
    .from("leads")
    .update({ content_verticals: contentVerticals })
    .eq("id", leadId);

  return NextResponse.json(
    { ok: true, content_verticals: contentVerticals },
    { status: 200 }
  );
}
