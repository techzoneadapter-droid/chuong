-- CHUONG Phase 4A: wallet foundation and immutable coin ledger
begin;

do $$ begin
  create type public.wallet_transaction_type as enum (
    'purchase_credit',
    'unlock_debit',
    'refund_credit',
    'promo_credit',
    'admin_credit',
    'admin_debit',
    'author_payout_debit'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.wallet_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance_coins bigint not null default 0 check (balance_coins >= 0),
  lifetime_credited bigint not null default 0 check (lifetime_credited >= 0),
  lifetime_spent bigint not null default 0 check (lifetime_spent >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.wallet_transaction_type not null,
  amount_coins bigint not null check (amount_coins <> 0),
  balance_after bigint not null check (balance_after >= 0),
  idempotency_key text,
  reference_type text,
  reference_id uuid,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint wallet_tx_idempotency_nonblank check (idempotency_key is null or length(btrim(idempotency_key)) > 0),
  constraint wallet_tx_reference_type_len check (reference_type is null or char_length(reference_type) <= 60),
  constraint wallet_tx_description_len check (description is null or char_length(description) <= 300)
);

create unique index if not exists wallet_transactions_idempotency_uq
  on public.wallet_transactions (idempotency_key)
  where idempotency_key is not null;

create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

create index if not exists wallet_transactions_reference_idx
  on public.wallet_transactions (reference_type, reference_id)
  where reference_id is not null;

drop trigger if exists wallet_accounts_set_updated_at on public.wallet_accounts;
create trigger wallet_accounts_set_updated_at
before update on public.wallet_accounts
for each row execute function public.set_updated_at();

create or replace function public.ensure_wallet_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wallet_accounts(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_wallet_after_profile_insert on public.profiles;
create trigger ensure_wallet_after_profile_insert
after insert on public.profiles
for each row execute function public.ensure_wallet_for_profile();

insert into public.wallet_accounts(user_id)
select p.id
from public.profiles p
on conflict (user_id) do nothing;

alter table public.wallet_accounts enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "users read own wallet" on public.wallet_accounts;
create policy "users read own wallet" on public.wallet_accounts
for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));

drop policy if exists "admins update wallets" on public.wallet_accounts;
create policy "admins update wallets" on public.wallet_accounts
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "users read own wallet transactions" on public.wallet_transactions;
create policy "users read own wallet transactions" on public.wallet_transactions
for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));

drop policy if exists "admins insert wallet transactions" on public.wallet_transactions;
create policy "admins insert wallet transactions" on public.wallet_transactions
for insert to authenticated
with check ((select private.is_admin()));

grant select on public.wallet_accounts to authenticated;
grant select on public.wallet_transactions to authenticated;
grant update on public.wallet_accounts to authenticated;
grant insert on public.wallet_transactions to authenticated;

-- Admin-only support adjustment. This is intentionally not a purchase API.
-- Purchase credits will be posted later only after store receipt verification.
create or replace function public.admin_adjust_wallet(
  p_user_id uuid,
  p_amount bigint,
  p_reason text,
  p_idempotency_key text default null
)
returns table (
  balance_coins bigint,
  transaction_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_balance bigint;
  v_tx_id uuid;
  v_type public.wallet_transaction_type;
  v_existing public.wallet_transactions%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_amount = 0 then
    raise exception 'Adjustment amount cannot be zero';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Adjustment reason is required';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.wallet_transactions
    where idempotency_key = p_idempotency_key;

    if found then
      if v_existing.user_id <> p_user_id or v_existing.amount_coins <> p_amount then
        raise exception 'Idempotency key already used for a different transaction';
      end if;
      return query select v_existing.balance_after, v_existing.id;
      return;
    end if;
  end if;

  select w.balance_coins into v_balance
  from public.wallet_accounts w
  where w.user_id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'Wallet not found';
  end if;

  if v_balance + p_amount < 0 then
    raise exception 'Insufficient wallet balance';
  end if;

  update public.wallet_accounts
  set
    balance_coins = balance_coins + p_amount,
    lifetime_credited = lifetime_credited + greatest(p_amount, 0),
    lifetime_spent = lifetime_spent + greatest(-p_amount, 0),
    updated_at = now()
  where user_id = p_user_id
  returning public.wallet_accounts.balance_coins into v_balance;

  v_type := case when p_amount > 0 then 'admin_credit'::public.wallet_transaction_type
                 else 'admin_debit'::public.wallet_transaction_type end;

  insert into public.wallet_transactions(
    user_id, type, amount_coins, balance_after,
    idempotency_key, reference_type, description
  )
  values (
    p_user_id, v_type, p_amount, v_balance,
    nullif(btrim(p_idempotency_key), ''), 'admin_adjustment', btrim(p_reason)
  )
  returning id into v_tx_id;

  return query select v_balance, v_tx_id;
end;
$$;

revoke execute on function public.admin_adjust_wallet(uuid,bigint,text,text) from public, anon;
grant execute on function public.admin_adjust_wallet(uuid,bigint,text,text) to authenticated;

commit;
