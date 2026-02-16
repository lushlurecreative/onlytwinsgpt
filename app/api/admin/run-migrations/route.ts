import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

const MIGRATIONS = [
  `alter table public.scrape_triggers add column if not exists criteria jsonb null default '{}';`,
  `alter table public.leads add column if not exists platforms_found text[] not null default '{}';`,
  `alter table public.leads add column if not exists profile_urls jsonb null default '{}';`,
  `alter table public.leads add column if not exists content_verticals text[] not null default '{}';`,
];

/**
 * Admin-only. Runs pending migrations using DATABASE_URL. Call once to apply migrations without manual SQL.
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

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return NextResponse.json(
      {
        error: "DATABASE_URL not set. Add your Supabase connection string to Vercel env for automatic migrations.",
      },
      { status: 503 }
    );
  }

  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    for (const sql of MIGRATIONS) {
      await client.query(sql);
    }
    await client.end();
    return NextResponse.json({ ok: true, message: "Migrations applied" }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Migration failed: ${msg}` }, { status: 500 });
  }
}
