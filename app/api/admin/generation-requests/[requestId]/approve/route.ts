import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Body = {
  approved?: boolean;
  adminNotes?: string;
};

type Params = {
  params: Promise<{ requestId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const { requestId } = await params;
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

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const approved = body.approved !== false;
  const status = approved ? "approved" : "rejected";

  const admin = getSupabaseAdmin();
  const updatePayload: Record<string, unknown> = {
    status,
    approved_by: user.id,
    approved_at: new Date().toISOString(),
  };
  if (typeof body.adminNotes === "string" && body.adminNotes.trim()) {
    updatePayload.admin_notes = body.adminNotes.trim();
  } else if (body.adminNotes === null) {
    updatePayload.admin_notes = null;
  }

  const { data, error } = await admin
    .from("generation_requests")
    .update(updatePayload)
    .eq("id", requestId)
    .select("id, status")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not update request" }, { status: 400 });
  }

  return NextResponse.json({ request: data }, { status: 200 });
}

