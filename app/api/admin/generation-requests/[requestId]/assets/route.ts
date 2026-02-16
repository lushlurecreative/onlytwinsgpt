import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Params = { params: Promise<{ requestId: string }> };

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
  const { requestId } = await params;

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
    .from("generation_requests")
    .select("id, sample_paths, output_paths")
    .eq("id", requestId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Request not found" }, { status: 404 });
  }

  const samplePaths = (data.sample_paths ?? []) as string[];
  const outputPaths = (data.output_paths ?? []) as string[];

  const [samples, outputs] = await Promise.all([
    signMany(samplePaths, 60 * 10),
    signMany(outputPaths, 60 * 10),
  ]);

  return NextResponse.json({ requestId, samples, outputs }, { status: 200 });
}

