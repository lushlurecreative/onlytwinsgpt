-- SYSTEM 3: Enrich presets for scene catalog + add generation lineage FKs

-- Enrich presets table with scene catalog metadata
alter table public.presets
  add column if not exists type text not null default 'image' check (type in ('image', 'video')),
  add column if not exists status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  add column if not exists thumbnail_path text null,
  add column if not exists camera_instructions text null,
  add column if not exists pose_instructions text null,
  add column if not exists wardrobe_tags text[] not null default '{}',
  add column if not exists environment_tags text[] not null default '{}',
  add column if not exists provider_defaults_json jsonb not null default '{}',
  add column if not exists sort_order integer not null default 0;

create index if not exists presets_type_status_idx on public.presets(type, status);
create index if not exists presets_sort_order_idx on public.presets(sort_order);

-- Update existing presets with sort order
update public.presets set sort_order = 1 where name = 'Beach' and sort_order = 0;
update public.presets set sort_order = 2 where name = 'Coffee shop' and sort_order = 0;
update public.presets set sort_order = 3 where name = 'Casual home' and sort_order = 0;
update public.presets set sort_order = 4 where name = 'Gym' and sort_order = 0;
update public.presets set sort_order = 5 where name = 'Street style' and sort_order = 0;
update public.presets set sort_order = 6 where name = 'Nightlife' and sort_order = 0;
update public.presets set sort_order = 7 where name = 'City' and sort_order = 0;
update public.presets set sort_order = 8 where name = 'Camping' and sort_order = 0;
update public.presets set sort_order = 9 where name = 'Swimsuit try-on' and sort_order = 0;

-- Add generation_job_id to posts for output lineage
alter table public.posts
  add column if not exists generation_job_id uuid null;

-- Add FK only if generation_jobs exists (it does, but be safe)
do $$ begin
  alter table public.posts
    add constraint posts_generation_job_id_fkey
    foreign key (generation_job_id) references public.generation_jobs(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists posts_generation_job_id_idx on public.posts(generation_job_id);

-- Add identity_model_id to generation_requests for model version tracking
alter table public.generation_requests
  add column if not exists identity_model_id uuid null;

do $$ begin
  alter table public.generation_requests
    add constraint generation_requests_identity_model_id_fkey
    foreign key (identity_model_id) references public.identity_models(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists generation_requests_identity_model_id_idx
  on public.generation_requests(identity_model_id);
