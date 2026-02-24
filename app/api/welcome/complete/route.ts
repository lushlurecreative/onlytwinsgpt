import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getWelcomeEligibilityByEmail } from "@/lib/welcome-eligibility";

export async function POST(request: Request) {
  try {
    let body: { email?: string; password?: string; displayName?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const email = body.email?.trim();
    const password = body.password;
    const displayName = body.displayName?.trim() ?? null;

    if (!email) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const eligibility = await getWelcomeEligibilityByEmail(supabaseAdmin, email);
    if (!eligibility.userId || !eligibility.canAccessWelcome) {
      return NextResponse.json(
        { error: "Welcome link is invalid or expired" },
        { status: 403 }
      );
    }

    await supabaseAdmin.auth.admin.updateUserById(eligibility.userId, {
      password,
    });

    const updates: { full_name?: string | null; onboarding_pending?: boolean } = {
      onboarding_pending: false,
    };
    if (displayName !== null) updates.full_name = displayName || null;
    await supabaseAdmin.from("profiles").update(updates).eq("id", eligibility.userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Completion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
