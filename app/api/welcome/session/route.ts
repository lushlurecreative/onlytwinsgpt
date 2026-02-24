import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getWelcomeEligibilityByEmail } from "@/lib/welcome-eligibility";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim();
    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const eligibility = await getWelcomeEligibilityByEmail(admin, email);
    if (!eligibility.canAccessWelcome) {
      return NextResponse.json(
        { error: "Welcome link is invalid or expired" },
        { status: 403 }
      );
    }

    return NextResponse.json({ email: eligibility.normalizedEmail, ready: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load welcome state";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
