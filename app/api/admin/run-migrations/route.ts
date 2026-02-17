import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";
import { runMigrations } from "@/lib/run-migrations";

/**
 * Admin-only. Runs pending migrations. Used internally by leads/ingest when schema errors occur.
 */
export async function POST() {
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

  const { ok, error } = await runMigrations();
  if (ok) {
    return NextResponse.json({ ok: true, message: "Migrations applied" }, { status: 200 });
  }
  return NextResponse.json(
    { error: error ?? "DATABASE_URL not set" },
    { status: error?.includes("DATABASE_URL") ? 503 : 500 }
  );
}
