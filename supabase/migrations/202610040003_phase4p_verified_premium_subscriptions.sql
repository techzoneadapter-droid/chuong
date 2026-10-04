-- CHUONG Phase 4P: verified Premium subscriptions
begin;

alter table public.account_subscriptions
  add column if not exists store_product_id text,
  add column if not exists latest_transaction_id text;

create index if not exists account_subscriptions_store_product_idx
  on public.account_subscriptions(store_product_id);

create or replace function public.upsert_verified_premium_subscription(
  p_user_id uuid,
  p_provider text,
  p_external_subscription_id text,
  p_store_product_id text,
  p_latest_transaction_id text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_active boolean,
  p_cancel_at_period_end boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns public.account_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.account_subscriptions%rowtype;
  v_status text := case when p_active then 'active' else 'expired' end;
begin
  if p_user_id is null then raise exception 'USER_REQUIRED'; end if;
  if p_provider not in ('google_play','app_store') then raise exception 'INVALID_PROVIDER'; end if;
  if p_external_subscription_id is null or length(btrim(p_external_subscription_id)) < 3 then
    raise exception 'SUBSCRIPTION_ID_REQUIRED';
  end if;
  if p_store_product_id is null or length(btrim(p_store_product_id)) < 3 then
    raise exception 'PRODUCT_ID_REQUIRED';
  end if;

  -- Only one active Premium entitlement per user. Expire any previous store
  -- subscription before activating/replacing the currently verified one.
  if p_active then
    update public.account_subscriptions s
       set status = 'expired',
           current_period_end = least(coalesce(s.current_period_end, now()), now()),
           updated_at = now()
     where s.user_id = p_user_id
       and s.plan = 'premium'
       and s.status in ('trialing','active','past_due')
       and not (
         s.provider = p_provider
         and s.external_subscription_id = btrim(p_external_subscription_id)
       );
  end if;

  select * into v_row
    from public.account_subscriptions s
   where s.provider = p_provider
     and s.external_subscription_id = btrim(p_external_subscription_id)
   for update;

  if found then
    if v_row.user_id <> p_user_id then raise exception 'SUBSCRIPTION_OWNER_CONFLICT'; end if;

    update public.account_subscriptions s
       set plan = 'premium',
           status = v_status,
           store_product_id = btrim(p_store_product_id),
           latest_transaction_id = nullif(btrim(coalesce(p_latest_transaction_id,'')), ''),
           current_period_start = p_current_period_start,
           current_period_end = p_current_period_end,
           cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
           metadata = coalesce(s.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
           updated_at = now()
     where s.id = v_row.id
     returning * into v_row;

    return v_row;
  end if;

  insert into public.account_subscriptions(
    user_id, plan, status, provider, external_subscription_id,
    store_product_id, latest_transaction_id,
    current_period_start, current_period_end, cancel_at_period_end, metadata
  ) values (
    p_user_id, 'premium', v_status, p_provider, btrim(p_external_subscription_id),
    btrim(p_store_product_id), nullif(btrim(coalesce(p_latest_transaction_id,'')), ''),
    p_current_period_start, p_current_period_end, coalesce(p_cancel_at_period_end, false),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.upsert_verified_premium_subscription(
  uuid,text,text,text,text,timestamptz,timestamptz,boolean,boolean,jsonb
) from public, anon, authenticated;
grant execute on function public.upsert_verified_premium_subscription(
  uuid,text,text,text,text,timestamptz,timestamptz,boolean,boolean,jsonb
) to service_role;

commit;
