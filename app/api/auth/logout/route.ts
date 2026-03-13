import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/** POST: Clear server-side auth session (cookies). Call from logout page so response clears auth cookies. */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
