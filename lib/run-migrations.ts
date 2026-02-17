/**
 * Runs pending migrations using DATABASE_URL. Call internally when schema errors are detected.
 * No auth - caller must verify admin before invoking.
 */

const MIGRATIONS = [
  `alter table public.scrape_triggers add column if not exists criteria jsonb null default '{}';`,
  `alter table public.leads add column if not exists sample_paths text[] not null default '{}';`,
  `alter table public.leads add column if not exists generated_sample_paths text[] not null default '{}';`,
  `alter table public.leads add column if not exists platforms_found text[] not null default '{}';`,
  `alter table public.leads add column if not exists profile_urls jsonb null default '{}';`,
  `alter table public.leads add column if not exists content_verticals text[] not null default '{}';`,
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
