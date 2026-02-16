import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Params = { params: Promise<{ leadId: string }> };

async function signMany(paths: string[], expiresInSeconds: number) {
  const admin = getSupabaseAdmin();
  const results: { path: string; signedUrl: string | null; error?: string }[] = [];
  for (const path of paths) {
    const { data, error } = await admin.storage.from("uploads").createSignedUrl(path, expiresInSeconds);
    results.push({ path, signedUrl: data?.signedUrl ?? null, error: error?.message });
  }
  return results;
}

export async function GET(_request: Request, { params }: Params) {
  const { leadId } = await params;

  const session = await createClient();
  const {
    data: { user },
    error: userError,
  } = await session.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("leads")
    .select("id, sample_paths, sample_preview_path, generated_sample_paths")
    .eq("id", leadId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Lead not found" }, { status: 404 });
  }

  const samplePaths = (data.sample_paths ?? []) as string[];
  const generatedPaths = (data.generated_sample_paths ?? []) as string[];
  const previewPath = data.sample_preview_path as string | null;
  const allPaths = [...samplePaths, ...(previewPath ? [previewPath] : []), ...generatedPaths];
  const uniquePaths = [...new Set(allPaths)].filter(Boolean);

  const signed = await signMany(uniquePaths, 60 * 10);
  const samples = signed.filter((s) => samplePaths.includes(s.path));
  const generated = signed.filter((s) => generatedPaths.includes(s.path));
  const preview = previewPath ? signed.find((s) => s.path === previewPath) : null;

  return NextResponse.json(
    { leadId, samples, generated, preview: preview ?? null },
    { status: 200 }
  );
}
