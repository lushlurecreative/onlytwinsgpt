-- RPC: convert lead to customer atomically (lead status + automation_events).
-- Used by billing webhook on checkout.session.completed (ONLYTWINS Spec Rule 6).

create or replace function public.convert_lead_to_customer(
  p_lead_id uuid,
  p_subscriber_id uuid,
  p_creator_id uuid,
  p_stripe_subscription_id text default null,
  p_plan text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leads
  set status = 'converted',
      updated_at = timezone('utc', now())
  where id = p_lead_id;

  insert into public.automation_events (event_type, entity_type, entity_id, payload_json)
  values (
    'converted',
    'lead',
    p_lead_id::text,
    jsonb_build_object(
      'stripe_subscription_id', coalesce(p_stripe_subscription_id, ''),
      'subscriber_id', p_subscriber_id
    )
  );
end;
$$;
