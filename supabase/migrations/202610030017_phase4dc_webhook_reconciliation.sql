-- CHUONG Phase 4D-C: store webhook audit + refund reversal recovery
begin;

create table if not exists public.store_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider public.store_provider not null,
  external_event_id text not null,
  event_type text not null,
  status text not null default 'received'
    check (status in ('received','ignored','processed','failed')),
  purchase_id uuid references public.store_purchases(id) on delete set null,
  payload_hash text not null,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint store_webhook_event_id_nonblank check (length(btrim(external_event_id)) > 0),
  constraint store_webhook_event_type_nonblank check (length(btrim(event_type)) > 0),
  constraint store_webhook_payload_hash_nonblank check (length(btrim(payload_hash)) >= 16)
);

create unique index if not exists store_webhook_events_provider_event_uq
  on public.store_webhook_events(provider, external_event_id);

create index if not exists store_webhook_events_received_idx
  on public.store_webhook_events(received_at desc);

create index if not exists store_webhook_events_status_idx
  on public.store_webhook_events(status, received_at desc);

create index if not exists store_webhook_events_purchase_idx
  on public.store_webhook_events(purchase_id, received_at desc)
  where purchase_id is not null;

alter table public.store_webhook_events enable row level security;

drop policy if exists "admins read store webhook events" on public.store_webhook_events;
create policy "admins read store webhook events" on public.store_webhook_events
for select to authenticated
using ((select private.is_admin()));

grant select on public.store_webhook_events to authenticated;

create or replace function public.restore_revoked_store_purchase(
  p_provider public.store_provider,
  p_external_transaction_id text,
  p_reason text,
  p_provider_payload jsonb default '{}'::jsonb
)
returns public.store_purchases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.store_purchases%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_debt_repay bigint := 0;
  v_balance_credit bigint := 0;
  v_wallet_tx uuid;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'RESTORE_REASON_REQUIRED';
  end if;

  select * into v_purchase
  from public.store_purchases sp
  where sp.provider = p_provider
    and sp.external_transaction_id = btrim(p_external_transaction_id)
  for update;

  if not found then raise exception 'STORE_PURCHASE_NOT_FOUND'; end if;

  if v_purchase.state <> 'revoked' then
    return v_purchase;
  end if;

  select * into v_wallet
  from public.wallet_accounts w
  where w.user_id = v_purchase.user_id
  for update;

  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  v_debt_repay := least(v_wallet.debt_coins, v_purchase.coins_granted);
  v_balance_credit := v_purchase.coins_granted - v_debt_repay;

  update public.wallet_accounts w
  set debt_coins = w.debt_coins - v_debt_repay,
      balance_coins = w.balance_coins + v_balance_credit,
      lifetime_reversed = greatest(0, w.lifetime_reversed - v_purchase.coins_granted),
      updated_at = now()
  where w.user_id = v_purchase.user_id
  returning * into v_wallet;

  if v_balance_credit > 0 then
    insert into public.wallet_transactions(
      user_id, type, amount_coins, balance_after, idempotency_key,
      reference_type, reference_id, description, metadata
    ) values (
      v_purchase.user_id,
      'refund_reversal_credit',
      v_balance_credit,
      v_wallet.balance_coins,
      'store:' || p_provider::text || ':' || btrim(p_external_transaction_id) || ':refund_reversed',
      'store_purchase',
      v_purchase.id,
      'Khôi phục Linh Thạch do cửa hàng đảo quyết định hoàn tiền',
      jsonb_build_object(
        'reason', btrim(p_reason),
        'coins_restored', v_purchase.coins_granted,
        'coins_to_balance', v_balance_credit,
        'coins_to_debt', v_debt_repay
      )
    ) returning id into v_wallet_tx;
  end if;

  update public.store_purchases sp
  set state = 'credited',
      revoked_at = null,
      provider_payload = sp.provider_payload || coalesce(p_provider_payload, '{}'::jsonb),
      updated_at = now()
  where sp.id = v_purchase.id
  returning * into v_purchase;

  insert into public.store_purchase_events(purchase_id, event_type, details)
  values (
    v_purchase.id,
    'refund_reversed',
    jsonb_build_object(
      'reason', btrim(p_reason),
      'coins_restored', v_purchase.coins_granted,
      'coins_to_balance', v_balance_credit,
      'coins_to_debt', v_debt_repay,
      'wallet_transaction_id', v_wallet_tx
    )
  );

  return v_purchase;
end;
$$;

revoke execute on function public.restore_revoked_store_purchase(public.store_provider,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.restore_revoked_store_purchase(public.store_provider,text,text,jsonb)
  to service_role;

commit;
