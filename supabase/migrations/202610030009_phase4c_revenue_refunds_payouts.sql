-- CHUONG Phase 4C: revenue share policy, refunds and payout ledger
begin;

do $$ begin
  create type public.author_payout_status as enum ('pending','approved','paid','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.revenue_share_policies (
  id uuid primary key default gen_random_uuid(),
  author_share_bps integer not null check (author_share_bps between 0 and 10000),
  active boolean not null default false,
  effective_at timestamptz not null default now(),
  ended_at timestamptz,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint revenue_policy_dates check (ended_at is null or ended_at >= effective_at)
);

create unique index if not exists revenue_share_one_active_idx
  on public.revenue_share_policies ((active))
  where active = true;

create index if not exists revenue_share_effective_idx
  on public.revenue_share_policies (effective_at desc);

alter table public.author_revenue_accounts
  add column if not exists author_earnings_coins bigint not null default 0 check (author_earnings_coins >= 0),
  add column if not exists refunded_earnings_coins bigint not null default 0 check (refunded_earnings_coins >= 0),
  add column if not exists paid_out_coins bigint not null default 0 check (paid_out_coins >= 0);

alter table public.author_revenue_ledger
  add column if not exists share_policy_id uuid references public.revenue_share_policies(id) on delete set null,
  add column if not exists author_share_bps integer check (author_share_bps is null or author_share_bps between 0 and 10000),
  add column if not exists author_earnings_coins bigint not null default 0,
  add column if not exists platform_share_coins bigint not null default 0;

create index if not exists author_revenue_ledger_policy_idx
  on public.author_revenue_ledger (share_policy_id)
  where share_policy_id is not null;

create table if not exists public.author_payouts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  amount_coins bigint not null check (amount_coins > 0),
  status public.author_payout_status not null default 'pending',
  external_reference text,
  note text check (note is null or char_length(note) <= 500),
  idempotency_key text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint author_payout_reference_len check (external_reference is null or char_length(external_reference) <= 180),
  constraint author_payout_idempotency_nonblank check (idempotency_key is null or length(btrim(idempotency_key)) > 0)
);

create unique index if not exists author_payouts_idempotency_uq
  on public.author_payouts (idempotency_key)
  where idempotency_key is not null;

create index if not exists author_payouts_author_created_idx
  on public.author_payouts (author_id, created_at desc);

create index if not exists author_payouts_processed_by_idx
  on public.author_payouts (processed_by)
  where processed_by is not null;

alter table public.revenue_share_policies enable row level security;
alter table public.author_payouts enable row level security;

drop policy if exists "authenticated read revenue policies" on public.revenue_share_policies;
create policy "authenticated read revenue policies" on public.revenue_share_policies
for select to authenticated
using (true);

drop policy if exists "authors read own payouts" on public.author_payouts;
create policy "authors read own payouts" on public.author_payouts
for select to authenticated
using (
  exists (
    select 1 from public.authors a
    where a.id = author_id and a.user_id = (select auth.uid())
  )
  or (select private.is_admin())
);

grant select on public.revenue_share_policies to authenticated;
grant select on public.author_payouts to authenticated;

create or replace function private.record_author_sale(
  p_author_id uuid,
  p_gross_coins bigint,
  p_book_id uuid,
  p_chapter_id uuid,
  p_book_entitlement_id uuid,
  p_chapter_entitlement_id uuid,
  p_wallet_transaction_id uuid,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy public.revenue_share_policies%rowtype;
  v_author_earnings bigint := 0;
  v_platform_share bigint := 0;
begin
  select * into v_policy
  from public.revenue_share_policies p
  where p.active = true
    and p.effective_at <= now()
    and (p.ended_at is null or p.ended_at > now())
  order by p.effective_at desc
  limit 1;

  if found then
    v_author_earnings := floor((p_gross_coins::numeric * v_policy.author_share_bps::numeric) / 10000)::bigint;
    v_platform_share := p_gross_coins - v_author_earnings;
  end if;

  update public.author_revenue_accounts a
  set gross_sales_coins = a.gross_sales_coins + p_gross_coins,
      author_earnings_coins = a.author_earnings_coins + v_author_earnings,
      updated_at = now()
  where a.author_id = p_author_id;

  insert into public.author_revenue_ledger(
    author_id, type, gross_coins, book_id, chapter_id,
    book_entitlement_id, chapter_entitlement_id, wallet_transaction_id,
    share_policy_id, author_share_bps, author_earnings_coins, platform_share_coins,
    description
  ) values (
    p_author_id, 'sale', p_gross_coins, p_book_id, p_chapter_id,
    p_book_entitlement_id, p_chapter_entitlement_id, p_wallet_transaction_id,
    case when found then v_policy.id else null end,
    case when found then v_policy.author_share_bps else null end,
    v_author_earnings, v_platform_share,
    p_description
  );
end;
$$;

revoke execute on function private.record_author_sale(uuid,bigint,uuid,uuid,uuid,uuid,uuid,text) from public, anon, authenticated;

create or replace function public.admin_set_revenue_share_policy(
  p_author_share_bps integer,
  p_note text default null,
  p_activate boolean default false
)
returns public.revenue_share_policies
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_policy public.revenue_share_policies%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_author_share_bps < 0 or p_author_share_bps > 10000 then
    raise exception 'Revenue share must be between 0 and 10000 basis points';
  end if;

  if p_activate then
    update public.revenue_share_policies
    set active = false, ended_at = coalesce(ended_at, now())
    where active = true;
  end if;

  insert into public.revenue_share_policies(
    author_share_bps, active, effective_at, note, created_by
  ) values (
    p_author_share_bps, p_activate, now(), nullif(btrim(p_note), ''), (select auth.uid())
  )
  returning * into v_policy;

  return v_policy;
end;
$$;

revoke execute on function public.admin_set_revenue_share_policy(integer,text,boolean) from public, anon;
grant execute on function public.admin_set_revenue_share_policy(integer,text,boolean) to authenticated;

create or replace function public.admin_refund_entitlement(
  p_entitlement_type text,
  p_entitlement_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns table (
  refunded_coins bigint,
  balance_coins bigint,
  refund_transaction_id uuid,
  already_refunded boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid;
  v_book uuid;
  v_chapter uuid;
  v_price bigint;
  v_revoked timestamptz;
  v_wallet public.wallet_accounts%rowtype;
  v_sale public.author_revenue_ledger%rowtype;
  v_refund_tx uuid;
  v_existing public.wallet_transactions%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_entitlement_type not in ('book','chapter') then
    raise exception 'INVALID_ENTITLEMENT_TYPE';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'REFUND_REASON_REQUIRED';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_existing
  from public.wallet_transactions wt
  where wt.idempotency_key = p_idempotency_key;

  if found then
    return query select
      greatest(v_existing.amount_coins, 0),
      v_existing.balance_after,
      v_existing.id,
      true;
    return;
  end if;

  if p_entitlement_type = 'book' then
    select e.user_id, e.book_id, null::uuid, e.price_paid_coins, e.revoked_at
      into v_user, v_book, v_chapter, v_price, v_revoked
    from public.book_entitlements e
    where e.id = p_entitlement_id
    for update;
  else
    select e.user_id, e.book_id, e.chapter_id, e.price_paid_coins, e.revoked_at
      into v_user, v_book, v_chapter, v_price, v_revoked
    from public.chapter_entitlements e
    where e.id = p_entitlement_id
    for update;
  end if;

  if v_user is null then raise exception 'ENTITLEMENT_NOT_FOUND'; end if;

  if v_revoked is not null then
    select wt.* into v_existing
    from public.wallet_transactions wt
    where wt.reference_type = 'refund_entitlement'
      and wt.reference_id = p_entitlement_id
    order by wt.created_at desc
    limit 1;

    return query select
      coalesce(greatest(v_existing.amount_coins, 0), 0),
      coalesce(v_existing.balance_after, (select w.balance_coins from public.wallet_accounts w where w.user_id = v_user)),
      v_existing.id,
      true;
    return;
  end if;

  select * into v_wallet
  from public.wallet_accounts w
  where w.user_id = v_user
  for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  if p_entitlement_type = 'book' then
    select * into v_sale
    from public.author_revenue_ledger l
    where l.book_entitlement_id = p_entitlement_id
      and l.type = 'sale'
    order by l.created_at asc
    limit 1;
  else
    select * into v_sale
    from public.author_revenue_ledger l
    where l.chapter_entitlement_id = p_entitlement_id
      and l.type = 'sale'
    order by l.created_at asc
    limit 1;
  end if;

  if p_entitlement_type = 'book' then
    update public.book_entitlements
    set revoked_at = now()
    where id = p_entitlement_id;
  else
    update public.chapter_entitlements
    set revoked_at = now()
    where id = p_entitlement_id;
  end if;

  if v_price > 0 then
    update public.wallet_accounts w
    set balance_coins = w.balance_coins + v_price,
        lifetime_credited = w.lifetime_credited + v_price,
        updated_at = now()
    where w.user_id = v_user
    returning w.balance_coins into v_wallet.balance_coins;

    insert into public.wallet_transactions(
      user_id, type, amount_coins, balance_after, idempotency_key,
      reference_type, reference_id, description
    ) values (
      v_user, 'refund_credit', v_price, v_wallet.balance_coins, btrim(p_idempotency_key),
      'refund_entitlement', p_entitlement_id, btrim(p_reason)
    ) returning id into v_refund_tx;
  end if;

  if v_sale.id is not null then
    update public.author_revenue_accounts a
    set refunded_coins = a.refunded_coins + v_price,
        refunded_earnings_coins = a.refunded_earnings_coins + greatest(v_sale.author_earnings_coins, 0),
        updated_at = now()
    where a.author_id = v_sale.author_id;

    insert into public.author_revenue_ledger(
      author_id, type, gross_coins, book_id, chapter_id,
      book_entitlement_id, chapter_entitlement_id, wallet_transaction_id,
      share_policy_id, author_share_bps, author_earnings_coins, platform_share_coins,
      description
    ) values (
      v_sale.author_id, 'refund', -v_price, v_book, v_chapter,
      case when p_entitlement_type='book' then p_entitlement_id else null end,
      case when p_entitlement_type='chapter' then p_entitlement_id else null end,
      v_refund_tx,
      v_sale.share_policy_id, v_sale.author_share_bps,
      -greatest(v_sale.author_earnings_coins, 0),
      -greatest(v_sale.platform_share_coins, 0),
      btrim(p_reason)
    );
  end if;

  return query select v_price, v_wallet.balance_coins, v_refund_tx, false;
end;
$$;

revoke execute on function public.admin_refund_entitlement(text,uuid,text,text) from public, anon;
grant execute on function public.admin_refund_entitlement(text,uuid,text,text) to authenticated;

create or replace function public.admin_record_paid_author_payout(
  p_author_id uuid,
  p_amount_coins bigint,
  p_external_reference text,
  p_note text,
  p_idempotency_key text
)
returns public.author_payouts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.author_revenue_accounts%rowtype;
  v_existing public.author_payouts%rowtype;
  v_payout public.author_payouts%rowtype;
  v_available bigint;
begin
  if not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_amount_coins <= 0 then raise exception 'INVALID_PAYOUT_AMOUNT'; end if;
  if p_external_reference is null or length(btrim(p_external_reference)) < 3 then
    raise exception 'EXTERNAL_REFERENCE_REQUIRED';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_existing
  from public.author_payouts p
  where p.idempotency_key = p_idempotency_key;

  if found then return v_existing; end if;

  select * into v_account
  from public.author_revenue_accounts a
  where a.author_id = p_author_id
  for update;

  if not found then raise exception 'AUTHOR_REVENUE_ACCOUNT_NOT_FOUND'; end if;

  v_available := v_account.author_earnings_coins
    - v_account.refunded_earnings_coins
    - v_account.paid_out_coins;

  if v_available < p_amount_coins then raise exception 'INSUFFICIENT_AUTHOR_EARNINGS'; end if;

  insert into public.author_payouts(
    author_id, amount_coins, status, external_reference, note,
    idempotency_key, processed_at, processed_by
  ) values (
    p_author_id, p_amount_coins, 'paid', btrim(p_external_reference),
    nullif(btrim(p_note), ''), btrim(p_idempotency_key), now(), (select auth.uid())
  )
  returning * into v_payout;

  update public.author_revenue_accounts a
  set paid_out_coins = a.paid_out_coins + p_amount_coins,
      updated_at = now()
  where a.author_id = p_author_id;

  return v_payout;
end;
$$;

revoke execute on function public.admin_record_paid_author_payout(uuid,bigint,text,text,text) from public, anon;
grant execute on function public.admin_record_paid_author_payout(uuid,bigint,text,text,text) to authenticated;

commit;
