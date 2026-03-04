import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next");
  const nextPath = nextParam && nextParam.startsWith("/") ? nextParam : "/dashboard";
  const origin = requestUrl.origin;
  const redirectTarget = new URL(nextPath, origin);

  if (!code) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=oauth", origin));
  }

  return NextResponse.redirect(redirectTarget);
}
