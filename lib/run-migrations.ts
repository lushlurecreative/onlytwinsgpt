/**
 * Runs pending migrations using DATABASE_URL. Call internally when schema errors are detected.
 * No auth - caller must verify admin before invoking.
 */

const MIGRATIONS = [
  `create table if not exists public.leads (
    id uuid primary key default gen_random_uuid(),
    source text not null,
    handle text not null,
    platform text not null,
    follower_count integer not null default 0,
    engagement_rate numeric(5,2) not null default 0,
    luxury_tag_hits integer not null default 0,
    score integer not null default 0,
    status text not null default 'imported' check (status in ('imported', 'approved', 'messaged', 'rejected')),
    profile_url text null,
    notes text null,
    sample_preview_path text null,
    approved_by uuid null,
    approved_at timestamptz null,
    messaged_at timestamptz null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
  );`,
  `alter table public.scrape_triggers add column if not exists criteria jsonb null default '{}';`,
  `alter table public.leads add column if not exists sample_paths text[] not null default '{}';`,
  `alter table public.leads add column if not exists generated_sample_paths text[] not null default '{}';`,
  `alter table public.leads add column if not exists platforms_found text[] not null default '{}';`,
  `alter table public.leads add column if not exists profile_urls jsonb null default '{}';`,
  `alter table public.leads add column if not exists content_verticals text[] not null default '{}';`,
  `drop policy if exists leads_service_role_all on public.leads; create policy leads_service_role_all on public.leads for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');`,
];

export async function runMigrations(): Promise<{ ok: boolean; error?: string }> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return { ok: false, error: "DATABASE_URL not set" };
  }
  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    for (const sql of MIGRATIONS) {
      try {
        await client.query(sql);
      } catch {
        // Skip if table/column already exists or table missing
      }
    }
    try {
      await client.query("notify pgrst, 'reload schema'");
    } catch {
      // Ignore - pooler may not support NOTIFY
    }
    await client.end();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
