create table if not exists public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_request_id uuid null references public.generation_requests(id) on delete set null,
  source text not null default 'generation_request',
  image_units integer not null default 0 check (image_units >= 0),
  video_units integer not null default 0 check (video_units >= 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists usage_ledger_user_period_idx
  on public.usage_ledger(user_id, period_start, period_end, created_at desc);

create index if not exists usage_ledger_generation_request_id_idx
  on public.usage_ledger(generation_request_id);

alter table public.usage_ledger enable row level security;

drop policy if exists usage_ledger_owner_select on public.usage_ledger;
create policy usage_ledger_owner_select on public.usage_ledger
for select using (auth.uid() = user_id);

create or replace function public.create_generation_request_with_usage(
  p_user_id uuid,
  p_sample_paths text[],
  p_scene_preset text,
  p_image_count integer,
  p_video_count integer,
  p_content_mode text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_limit_images integer,
  p_limit_videos integer
)
returns table (
  id uuid,
  status text,
  created_at timestamptz,
  used_images integer,
  used_videos integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used_images integer := 0;
  v_used_videos integer := 0;
  v_id uuid;
  v_status text;
  v_created_at timestamptz;
  v_image_count integer := greatest(coalesce(p_image_count, 0), 0);
  v_video_count integer := greatest(coalesce(p_video_count, 0), 0);
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_period_start::text || ':' || p_period_end::text));

  select
    coalesce(sum(l.image_units), 0),
    coalesce(sum(l.video_units), 0)
  into v_used_images, v_used_videos
  from public.usage_ledger l
  where l.user_id = p_user_id
    and l.period_start = p_period_start
    and l.period_end = p_period_end;

  if v_used_images + v_image_count > greatest(coalesce(p_limit_images, 0), 0) then
    raise exception 'USAGE_LIMIT_EXCEEDED_IMAGES' using errcode = 'P0001';
  end if;

  if v_used_videos + v_video_count > greatest(coalesce(p_limit_videos, 0), 0) then
    raise exception 'USAGE_LIMIT_EXCEEDED_VIDEOS' using errcode = 'P0001';
  end if;

  insert into public.generation_requests (
    user_id,
    sample_paths,
    scene_preset,
    image_count,
    video_count,
    content_mode,
    status,
    progress_done,
    progress_total
  )
  values (
    p_user_id,
    p_sample_paths,
    p_scene_preset,
    v_image_count,
    v_video_count,
    case when p_content_mode = 'mature' then 'mature' else 'sfw' end,
    'pending',
    0,
    v_image_count + v_video_count
  )
  returning generation_requests.id, generation_requests.status, generation_requests.created_at
  into v_id, v_status, v_created_at;

  insert into public.usage_ledger (
    user_id,
    generation_request_id,
    source,
    image_units,
    video_units,
    period_start,
    period_end,
    metadata_json
  )
  values (
    p_user_id,
    v_id,
    'generation_request',
    v_image_count,
    v_video_count,
    p_period_start,
    p_period_end,
    jsonb_build_object(
      'scene_preset', p_scene_preset,
      'content_mode', case when p_content_mode = 'mature' then 'mature' else 'sfw' end
    )
  );

  id := v_id;
  status := v_status;
  created_at := v_created_at;
  used_images := v_used_images + v_image_count;
  used_videos := v_used_videos + v_video_count;
  return next;
end;
$$;

grant execute on function public.create_generation_request_with_usage(
  uuid, text[], text, integer, integer, text, timestamptz, timestamptz, integer, integer
) to authenticated, service_role;
