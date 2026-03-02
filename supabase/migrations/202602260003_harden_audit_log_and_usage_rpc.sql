-- Harden audit_log admin matching and usage RPC caller/idempotency behavior.

-- 1) audit_log RLS: avoid substring matching; require exact UUID token match.
drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
for select using (
  auth.uid() is not null
  and exists (
    select 1
    from public.app_settings s
    where s.key in ('admin_user_ids', 'ADMIN_USER_IDS')
      and auth.uid()::text = any (
        regexp_split_to_array(
          regexp_replace(coalesce(s.value, ''), '\s+', '', 'g'),
          ','
        )
      )
  )
);

-- 2) usage_ledger idempotency key support (optional but enforced when provided).
alter table public.usage_ledger
  add column if not exists idempotency_key text null;

create unique index if not exists usage_ledger_user_idempotency_key_uq
  on public.usage_ledger(user_id, idempotency_key)
  where idempotency_key is not null;

-- 3) Replace RPC with caller guard + idempotency handling.
drop function if exists public.create_generation_request_with_usage(
  uuid, text[], text, integer, integer, text, timestamptz, timestamptz, integer, integer
);

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
  p_limit_videos integer,
  p_idempotency_key text default null
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
  v_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_existing_request_id uuid;
begin
  -- Caller guard:
  -- - Authenticated clients: auth.uid() must match requested user_id
  -- - Service role/server callers: auth.uid() is null and are allowed
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'UNAUTHORIZED_USER_MISMATCH' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_period_start::text || ':' || p_period_end::text));

  -- Idempotent retry path: return existing request/usage result (no double charge).
  if v_idempotency_key is not null then
    select l.generation_request_id
    into v_existing_request_id
    from public.usage_ledger l
    where l.user_id = p_user_id
      and l.idempotency_key = v_idempotency_key
    order by l.created_at desc
    limit 1;

    if v_existing_request_id is not null then
      select
        coalesce(sum(l.image_units), 0),
        coalesce(sum(l.video_units), 0)
      into v_used_images, v_used_videos
      from public.usage_ledger l
      where l.user_id = p_user_id
        and l.period_start = p_period_start
        and l.period_end = p_period_end;

      select g.id, g.status, g.created_at
      into v_id, v_status, v_created_at
      from public.generation_requests g
      where g.id = v_existing_request_id;

      id := v_id;
      status := v_status;
      created_at := v_created_at;
      used_images := v_used_images;
      used_videos := v_used_videos;
      return next;
      return;
    end if;
  end if;

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
    metadata_json,
    idempotency_key
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
    ),
    v_idempotency_key
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
  uuid, text[], text, integer, integer, text, timestamptz, timestamptz, integer, integer, text
) to authenticated, service_role;
