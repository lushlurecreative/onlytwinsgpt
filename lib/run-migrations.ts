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

  // ONLYTWINS stack: subjects, subjects_models, training_jobs, generation_jobs, presets
  `create table if not exists public.subjects (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    label text null,
    consent_status text not null default 'pending' check (consent_status in ('pending', 'approved', 'revoked')),
    consent_signed_at timestamptz null,
    identity_verified_at timestamptz null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
  );`,
  `create index if not exists subjects_user_id_idx on public.subjects(user_id);`,
  `create index if not exists subjects_consent_status_idx on public.subjects(consent_status);`,

  `create table if not exists public.presets (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    prompt text not null default '',
    negative_prompt text not null default '',
    parameter_json jsonb not null default '{}',
    created_at timestamptz not null default timezone('utc', now())
  );`,

  `create table if not exists public.subjects_models (
    id uuid primary key default gen_random_uuid(),
    subject_id uuid not null references public.subjects(id) on delete cascade,
    lora_model_reference text null,
    training_status text not null default 'pending' check (training_status in ('pending', 'training', 'completed', 'failed')),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique(subject_id)
  );`,
  `create index if not exists subjects_models_subject_id_idx on public.subjects_models(subject_id);`,

  `create table if not exists public.training_jobs (
    id uuid primary key default gen_random_uuid(),
    subject_id uuid not null references public.subjects(id) on delete cascade,
    status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
    logs text null,
    started_at timestamptz null,
    finished_at timestamptz null,
    sample_paths text[] not null default '{}',
    created_at timestamptz not null default timezone('utc', now())
  );`,
  `create index if not exists training_jobs_subject_id_idx on public.training_jobs(subject_id);`,
  `create index if not exists training_jobs_status_idx on public.training_jobs(status);`,

  `create table if not exists public.generation_jobs (
    id uuid primary key default gen_random_uuid(),
    subject_id uuid null references public.subjects(id) on delete set null,
    preset_id uuid not null references public.presets(id) on delete restrict,
    status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
    output_path text null,
    reference_image_path text not null,
    lora_model_reference text null,
    controlnet_input_path text null,
    generation_request_id uuid null,
    created_at timestamptz not null default timezone('utc', now())
  );`,
  `create index if not exists generation_jobs_subject_id_idx on public.generation_jobs(subject_id);`,
  `create index if not exists generation_jobs_status_idx on public.generation_jobs(status);`,
  `create index if not exists generation_jobs_generation_request_id_idx on public.generation_jobs(generation_request_id);`,
  `do $$ begin if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'generation_requests') then alter table public.generation_jobs add constraint generation_jobs_generation_request_id_fkey foreign key (generation_request_id) references public.generation_requests(id) on delete set null; end if; exception when duplicate_object then null; end $$;`,

  `create table if not exists public.app_settings ( key text primary key, value text not null default '', updated_at timestamptz not null default timezone('utc', now()) );`,
  `alter table public.training_jobs add column if not exists runpod_job_id text null;`,
  `alter table public.generation_jobs add column if not exists runpod_job_id text null;`,
  `create index if not exists training_jobs_runpod_job_id_idx on public.training_jobs(runpod_job_id) where runpod_job_id is not null;`,
  `create index if not exists generation_jobs_runpod_job_id_idx on public.generation_jobs(runpod_job_id) where runpod_job_id is not null;`,

  // Seed presets from scene presets (only when empty)
  `insert into public.presets (name, prompt, negative_prompt, parameter_json)
   select v.name, v.prompt, v.neg, v.params from (values
     ('Beach', 'A realistic beach scene with natural daylight, ocean water movement, and authentic skin texture.', '', '{}'),
     ('Camping', 'An outdoor camping scene with natural environment details, realistic lighting, and lifestyle composition.', '', '{}'),
     ('Coffee shop', 'A modern coffee shop scene with natural indoor lighting, realistic depth, and candid lifestyle framing.', '', '{}'),
     ('Swimsuit try-on', 'A clean lifestyle try-on scene with realistic body proportions, natural skin detail, and commercial-grade clarity.', '', '{}'),
     ('Gym', 'A premium gym environment with realistic fitness context, natural lighting, and crisp, authentic detail.', '', '{}'),
     ('Casual home', 'A casual home setting with warm natural light, realistic textures, and everyday lifestyle composition.', '', '{}'),
     ('Street style', 'A street-style city look with realistic urban background, fashion-forward framing, and natural detail.', '', '{}'),
     ('Nightlife', 'A nightlife environment with cinematic but realistic low-light tones and sharp subject consistency.', '', '{}'),
     ('City', 'A polished city environment with realistic architecture, natural perspective, and editorial quality lighting.', '', '{}')
   ) as v(name, prompt, neg, params)
   where (select count(*) from public.presets) = 0;`,
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
