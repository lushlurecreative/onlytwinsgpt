import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const requestId = request.nextUrl.searchParams.get("request_id");

  let query = admin
    .from("generation_outputs")
    .select("id, generation_request_id, generation_job_id, output_type, storage_path, width, height, duration_seconds, file_size, is_watermarked, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (requestId) {
    query = query.eq("generation_request_id", requestId);
  }

  const { data, error } = await query.limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Generate signed URLs for each output
  const outputs = await Promise.all(
    (data ?? []).map(async (output) => {
      const { data: signedData } = await admin.storage
        .from("uploads")
        .createSignedUrl(output.storage_path, 300);
      return {
        ...output,
        signed_url: signedData?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({ outputs }, { status: 200 });
}
