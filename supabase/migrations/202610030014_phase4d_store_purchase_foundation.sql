-- CHUONG Phase 4D-A: store catalog, verified purchase ledger and revocation debt safety
begin;

do $$ begin
  create type public.store_provider as enum ('google_play','app_store');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.store_purchase_state as enum ('verified','credited','revoked','rejected');
exception when duplicate_object then null; end $$;

alter table public.wallet_accounts
  add column if not exists debt_coins bigint not null default 0 check (debt_coins >= 0),
  add column if not exists lifetime_reversed bigint not null default 0 check (lifetime_reversed >= 0);

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  coins bigint not null check (coins > 0),
  google_product_id text,
  apple_product_id text,
  active boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_products_sku_nonblank check (length(btrim(sku)) > 0),
  constraint store_products_provider_id check (google_product_id is not null or apple_product_id is not null)
);

create unique index if not exists store_products_google_product_uq
  on public.store_products (google_product_id)
  where google_product_id is not null;

create unique index if not exists store_products_apple_product_uq
  on public.store_products (apple_product_id)
  where apple_product_id is not null;

create index if not exists store_products_active_sort_idx
  on public.store_products (active, sort_order, coins);

drop trigger if exists store_products_set_updated_at on public.store_products;
create trigger store_products_set_updated_at
before update on public.store_products
for each row execute function public.set_updated_at();

create table if not exists public.store_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  provider public.store_provider not null,
  product_id uuid not null references public.store_products(id) on delete restrict,
  external_transaction_id text not null,
  receipt_hash text not null,
  state public.store_purchase_state not null default 'verified',
  coins_granted bigint not null default 0 check (coins_granted >= 0),
  coins_to_balance bigint not null default 0 check (coins_to_balance >= 0),
  coins_to_debt bigint not null default 0 check (coins_to_debt >= 0),
  verified_at timestamptz not null default now(),
  credited_at timestamptz,
  revoked_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_purchase_tx_nonblank check (length(btrim(external_transaction_id)) > 0),
  constraint store_purchase_receipt_hash_nonblank check (length(btrim(receipt_hash)) >= 16),
  constraint store_purchase_credit_split check (coins_to_balance + coins_to_debt <= coins_granted)
);

create unique index if not exists store_purchases_provider_tx_uq
  on public.store_purchases (provider, external_transaction_id);

create unique index if not exists store_purchases_provider_receipt_uq
  on public.store_purchases (provider, receipt_hash);

create index if not exists store_purchases_user_created_idx
  on public.store_purchases (user_id, created_at desc);

create index if not exists store_purchases_product_idx
  on public.store_purchases (product_id, created_at desc);

create index if not exists store_purchases_state_idx
  on public.store_purchases (state, updated_at desc);

drop trigger if exists store_purchases_set_updated_at on public.store_purchases;
create trigger store_purchases_set_updated_at
before update on public.store_purchases
for each row execute function public.set_updated_at();

create table if not exists public.store_purchase_events (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.store_purchases(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint store_purchase_event_nonblank check (length(btrim(event_type)) > 0)
);

create index if not exists store_purchase_events_purchase_idx
  on public.store_purchase_events (purchase_id, created_at desc);

alter table public.store_products enable row level security;
alter table public.store_purchases enable row level security;
alter table public.store_purchase_events enable row level security;

drop policy if exists "read active store products" on public.store_products;
create policy "read active store products" on public.store_products
for select to anon, authenticated
using (active = true or (select private.is_admin()));

drop policy if exists "users read own store purchases" on public.store_purchases;
create policy "users read own store purchases" on public.store_purchases
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "admins read store purchase events" on public.store_purchase_events;
create policy "admins read store purchase events" on public.store_purchase_events
for select to authenticated
using ((select private.is_admin()));

grant select on public.store_products to anon, authenticated;
grant select on public.store_purchases to authenticated;
grant select on public.store_purchase_events to authenticated;

insert into public.store_products(
  sku, coins, google_product_id, apple_product_id, active, sort_order
) values
  ('coins_100', 100, 'chuong.coins.100', 'chuong.coins.100', true, 10),
  ('coins_550', 550, 'chuong.coins.550', 'chuong.coins.550', true, 20),
  ('coins_1200', 1200, 'chuong.coins.1200', 'chuong.coins.1200', true, 30),
  ('coins_2600', 2600, 'chuong.coins.2600', 'chuong.coins.2600', true, 40)
on conflict (sku) do update
set coins = excluded.coins,
    google_product_id = excluded.google_product_id,
    apple_product_id = excluded.apple_product_id,
    active = excluded.active,
    sort_order = excluded.sort_order,
    updated_at = now();

create or replace function public.credit_verified_store_purchase(
  p_user_id uuid,
  p_provider public.store_provider,
  p_store_product_id text,
  p_external_transaction_id text,
  p_receipt_hash text,
  p_provider_payload jsonb default '{}'::jsonb
)
returns public.store_purchases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.store_products%rowtype;
  v_purchase public.store_purchases%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_debt_repay bigint;
  v_balance_credit bigint;
  v_wallet_tx uuid;
begin
  if p_user_id is null then raise exception 'USER_REQUIRED'; end if;
  if p_external_transaction_id is null or length(btrim(p_external_transaction_id)) < 3 then
    raise exception 'TRANSACTION_ID_REQUIRED';
  end if;
  if p_receipt_hash is null or length(btrim(p_receipt_hash)) < 16 then
    raise exception 'RECEIPT_HASH_REQUIRED';
  end if;

  select * into v_purchase
  from public.store_purchases sp
  where sp.provider = p_provider
    and sp.external_transaction_id = btrim(p_external_transaction_id);

  if found then
    if v_purchase.user_id <> p_user_id then raise exception 'TRANSACTION_OWNER_CONFLICT'; end if;
    return v_purchase;
  end if;

  if p_provider = 'google_play' then
    select * into v_product
    from public.store_products p
    where p.active = true and p.google_product_id = p_store_product_id;
  else
    select * into v_product
    from public.store_products p
    where p.active = true and p.apple_product_id = p_store_product_id;
  end if;

  if not found then raise exception 'STORE_PRODUCT_NOT_CONFIGURED'; end if;

  insert into public.store_purchases(
    user_id, provider, product_id, external_transaction_id, receipt_hash,
    state, provider_payload
  ) values (
    p_user_id, p_provider, v_product.id, btrim(p_external_transaction_id), btrim(p_receipt_hash),
    'verified', coalesce(p_provider_payload, '{}'::jsonb)
  )
  returning * into v_purchase;

  select * into v_wallet
  from public.wallet_accounts w
  where w.user_id = p_user_id
  for update;

  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  v_debt_repay := least(v_wallet.debt_coins, v_product.coins);
  v_balance_credit := v_product.coins - v_debt_repay;

  update public.wallet_accounts w
  set debt_coins = w.debt_coins - v_debt_repay,
      balance_coins = w.balance_coins + v_balance_credit,
      lifetime_credited = w.lifetime_credited + v_product.coins,
      updated_at = now()
  where w.user_id = p_user_id
  returning * into v_wallet;

  if v_balance_credit > 0 then
    insert into public.wallet_transactions(
      user_id, type, amount_coins, balance_after, idempotency_key,
      reference_type, reference_id, description, metadata
    ) values (
      p_user_id, 'purchase_credit', v_balance_credit, v_wallet.balance_coins,
      'store:' || p_provider::text || ':' || btrim(p_external_transaction_id) || ':credit',
      'store_purchase', v_purchase.id,
      'Nạp CHƯƠNG Xu qua ' || case when p_provider='google_play' then 'Google Play' else 'App Store' end,
      jsonb_build_object(
        'sku', v_product.sku,
        'coins_purchased', v_product.coins,
        'coins_to_balance', v_balance_credit,
        'coins_to_debt', v_debt_repay
      )
    ) returning id into v_wallet_tx;
  end if;

  update public.store_purchases sp
  set state = 'credited',
      coins_granted = v_product.coins,
      coins_to_balance = v_balance_credit,
      coins_to_debt = v_debt_repay,
      credited_at = now(),
      updated_at = now()
  where sp.id = v_purchase.id
  returning * into v_purchase;

  insert into public.store_purchase_events(purchase_id, event_type, details)
  values (
    v_purchase.id,
    'credited',
    jsonb_build_object(
      'coins_granted', v_product.coins,
      'coins_to_balance', v_balance_credit,
      'coins_to_debt', v_debt_repay,
      'wallet_transaction_id', v_wallet_tx
    )
  );

  return v_purchase;
end;
$$;

revoke execute on function public.credit_verified_store_purchase(uuid,public.store_provider,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.credit_verified_store_purchase(uuid,public.store_provider,text,text,text,jsonb)
  to service_role;

create or replace function public.revoke_verified_store_purchase(
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
  v_remove_from_balance bigint := 0;
  v_add_debt bigint := 0;
  v_wallet_tx uuid;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'REVOCATION_REASON_REQUIRED'; end if;

  select * into v_purchase
  from public.store_purchases sp
  where sp.provider = p_provider
    and sp.external_transaction_id = btrim(p_external_transaction_id)
  for update;

  if not found then raise exception 'STORE_PURCHASE_NOT_FOUND'; end if;
  if v_purchase.state = 'revoked' then return v_purchase; end if;

  if v_purchase.state = 'credited' then
    select * into v_wallet
    from public.wallet_accounts w
    where w.user_id = v_purchase.user_id
    for update;

    if not found then raise exception 'WALLET_NOT_FOUND'; end if;

    v_remove_from_balance := least(v_wallet.balance_coins, v_purchase.coins_to_balance);
    v_add_debt := v_purchase.coins_to_debt + (v_purchase.coins_to_balance - v_remove_from_balance);

    update public.wallet_accounts w
    set balance_coins = w.balance_coins - v_remove_from_balance,
        debt_coins = w.debt_coins + v_add_debt,
        lifetime_reversed = w.lifetime_reversed + v_purchase.coins_granted,
        updated_at = now()
    where w.user_id = v_purchase.user_id
    returning * into v_wallet;

    if v_remove_from_balance > 0 then
      insert into public.wallet_transactions(
        user_id, type, amount_coins, balance_after, idempotency_key,
        reference_type, reference_id, description, metadata
      ) values (
        v_purchase.user_id, 'purchase_reversal_debit', -v_remove_from_balance,
        v_wallet.balance_coins,
        'store:' || p_provider::text || ':' || btrim(p_external_transaction_id) || ':revoke',
        'store_purchase', v_purchase.id,
        'Thu hồi Xu do giao dịch cửa hàng bị hoàn/hủy',
        jsonb_build_object(
          'reason', btrim(p_reason),
          'coins_removed', v_remove_from_balance,
          'debt_added', v_add_debt
        )
      ) returning id into v_wallet_tx;
    end if;
  end if;

  update public.store_purchases sp
  set state = 'revoked',
      revoked_at = now(),
      provider_payload = sp.provider_payload || coalesce(p_provider_payload, '{}'::jsonb),
      updated_at = now()
  where sp.id = v_purchase.id
  returning * into v_purchase;

  insert into public.store_purchase_events(purchase_id, event_type, details)
  values (
    v_purchase.id,
    'revoked',
    jsonb_build_object(
      'reason', btrim(p_reason),
      'coins_removed', v_remove_from_balance,
      'debt_added', v_add_debt,
      'wallet_transaction_id', v_wallet_tx
    )
  );

  return v_purchase;
end;
$$;

revoke execute on function public.revoke_verified_store_purchase(public.store_provider,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.revoke_verified_store_purchase(public.store_provider,text,text,jsonb)
  to service_role;

commit;
