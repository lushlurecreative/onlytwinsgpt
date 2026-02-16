import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isAdminUser } from "@/lib/admin";

type Params = {
  params: Promise<{ leadId: string }>;
};

type Body = {
  approved?: boolean;
};

export async function PATCH(request: Request, { params }: Params) {
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

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const approved = body.approved !== false;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("leads")
    .update({
      status: approved ? "approved" : "rejected",
      approved_at: approved ? new Date().toISOString() : null,
      approved_by: approved ? user.id : null,
    })
    .eq("id", leadId)
    .select("id, status")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not update lead" }, { status: 400 });
  }
  return NextResponse.json({ lead: data }, { status: 200 });
}

