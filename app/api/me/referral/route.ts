import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { logError } from "@/lib/observability";

function generateCode(): string {
  // 8 uppercase alphanumeric characters, easy to read (no 0/O/I/1 confusion)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function createUniqueCode(
  admin: ReturnType<typeof import("@/lib/supabase-admin").getSupabaseAdmin>
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const { data: existing } = await admin
      .from("referrals")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique referral code after 10 attempts");
}

export async function GET() {
  try {
    const supabase = await createClient();
    const admin = getSupabaseAdmin();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find existing referral row for this user
    const { data: existing } = await admin
      .from("referrals")
      .select("id, code, referred_user_id, redeemed_at, discount_applied_at")
      .eq("referrer_id", user.id)
      .maybeSingle();

    const row = existing as {
      id: string;
      code: string;
      referred_user_id: string | null;
      redeemed_at: string | null;
      discount_applied_at: string | null;
    } | null;

    if (row) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://onlytwins.dev";
      return NextResponse.json({
        code: row.code,
        referralUrl: `${baseUrl}/?ref=${row.code}`,
        redeemed: !!row.redeemed_at,
        discountApplied: !!row.discount_applied_at,
      });
    }

    // Create a new referral code
    const code = await createUniqueCode(admin);
    const { data: created, error: insertError } = await admin
      .from("referrals")
      .insert({ referrer_id: user.id, code })
      .select("code")
      .single();

    if (insertError || !created) {
      return NextResponse.json({ error: "Failed to create referral code." }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://onlytwins.dev";
    return NextResponse.json({
      code: (created as { code: string }).code,
      referralUrl: `${baseUrl}/?ref=${(created as { code: string }).code}`,
      redeemed: false,
      discountApplied: false,
    });
  } catch (error) {
    logError("referral_get_error", error);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
