import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") !== "false";

  let query = supabase
    .from("user_notifications")
    .select("id, type, payload_json, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (unreadOnly) {
    query = query.is("read_at", null);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ notifications: data ?? [] });
}
