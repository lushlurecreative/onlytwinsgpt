import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Internal API to execute arbitrary SQL queries
 * Protected by WORKER_SECRET to prevent unauthorized use
 * Usage: POST /api/internal/execute-sql with { secret, sql }
 */
export async function POST(req: NextRequest) {
  try {
    const { secret, sql } = await req.json();

    // Verify secret
    if (secret !== process.env.WORKER_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!sql || typeof sql !== "string") {
      return NextResponse.json({ error: "Missing sql parameter" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("sql", { query: sql });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
