import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { setUserRole, type UserRole } from "@/lib/roles";

/** PATCH: Set current user's role (self-service). Only allows setting to 'creator'. */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { role?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const role = (body.role ?? "").trim().toLowerCase();
  if (role !== "creator") {
    return NextResponse.json(
      { error: "Self-service only allows setting role to creator." },
      { status: 400 }
    );
  }

  const result = await setUserRole(supabase, user.id, "creator" as UserRole);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to update role" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, role: "creator" });
}
