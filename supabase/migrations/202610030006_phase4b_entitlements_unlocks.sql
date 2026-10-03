-- CHUONG Phase 4B: VIP entitlements, atomic unlocks, protected chapter content, author gross revenue attribution
begin;

do $$ begin
  create type public.entitlement_source as enum ('coin_unlock','admin_grant','promo','refund_restore');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.author_revenue_type as enum ('sale','refund','adjustment');
exception when duplicate_object then null; end $$;

create table if not exists public.book_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  source public.entitlement_source not null default 'coin_unlock',
  price_paid_coins bigint not null default 0 check (price_paid_coins >= 0),
  wallet_transaction_id uuid references public.wallet_transactions(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, book_id)
);

create table if not exists public.chapter_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  source public.entitlement_source not null default 'coin_unlock',
  price_paid_coins bigint not null default 0 check (price_paid_coins >= 0),
  wallet_transaction_id uuid references public.wallet_transactions(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, chapter_id)
);

create table if not exists public.author_revenue_accounts (
  author_id uuid primary key references public.authors(id) on delete cascade,
  gross_sales_coins bigint not null default 0 check (gross_sales_coins >= 0),
  refunded_coins bigint not null default 0 check (refunded_coins >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.author_revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  type public.author_revenue_type not null,
  gross_coins bigint not null check (gross_coins <> 0),
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  book_entitlement_id uuid references public.book_entitlements(id) on delete set null,
  chapter_entitlement_id uuid references public.chapter_entitlements(id) on delete set null,
  wallet_transaction_id uuid references public.wallet_transactions(id) on delete set null,
  description text,
  created_at timestamptz not null default now(),
  constraint author_revenue_exact_source check (num_nonnulls(book_entitlement_id, chapter_entitlement_id) = 1),
  constraint author_revenue_description_len check (description is null or char_length(description) <= 300)
);

create index if not exists book_entitlements_user_idx on public.book_entitlements (user_id, granted_at desc);
create index if not exists book_entitlements_book_idx on public.book_entitlements (book_id) where revoked_at is null;
create index if not exists chapter_entitlements_user_idx on public.chapter_entitlements (user_id, granted_at desc);
create index if not exists chapter_entitlements_book_idx on public.chapter_entitlements (book_id, user_id) where revoked_at is null;
create index if not exists chapter_entitlements_chapter_idx on public.chapter_entitlements (chapter_id) where revoked_at is null;
create index if not exists author_revenue_ledger_author_idx on public.author_revenue_ledger (author_id, created_at desc);
create index if not exists author_revenue_ledger_book_idx on public.author_revenue_ledger (book_id, created_at desc);
create index if not exists author_revenue_ledger_chapter_idx on public.author_revenue_ledger (chapter_id, created_at desc) where chapter_id is not null;

drop trigger if exists author_revenue_accounts_set_updated_at on public.author_revenue_accounts;
create trigger author_revenue_accounts_set_updated_at
before update on public.author_revenue_accounts
for each row execute function public.set_updated_at();

create or replace function public.ensure_revenue_account_for_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.author_revenue_accounts(author_id)
  values (new.id)
  on conflict (author_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.ensure_revenue_account_for_author() from public, anon, authenticated;

drop trigger if exists ensure_revenue_after_author_insert on public.authors;
create trigger ensure_revenue_after_author_insert
after insert on public.authors
for each row execute function public.ensure_revenue_account_for_author();

insert into public.author_revenue_accounts(author_id)
select id from public.authors
on conflict (author_id) do nothing;

alter table public.book_entitlements enable row level security;
alter table public.chapter_entitlements enable row level security;
alter table public.author_revenue_accounts enable row level security;
alter table public.author_revenue_ledger enable row level security;

create policy "users read own book entitlements" on public.book_entitlements
for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "users read own chapter entitlements" on public.chapter_entitlements
for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "authors read own revenue account" on public.author_revenue_accounts
for select to authenticated
using (
  exists (
    select 1 from public.authors a
    where a.id = author_id and a.user_id = (select auth.uid())
  )
  or (select private.is_admin())
);

create policy "authors read own revenue ledger" on public.author_revenue_ledger
for select to authenticated
using (
  exists (
    select 1 from public.authors a
    where a.id = author_id and a.user_id = (select auth.uid())
  )
  or (select private.is_admin())
);

grant select on public.book_entitlements to authenticated;
grant select on public.chapter_entitlements to authenticated;
grant select on public.author_revenue_accounts to authenticated;
grant select on public.author_revenue_ledger to authenticated;

-- Chapter body must never be exposed by a direct PostgREST table SELECT.
-- Keep safe metadata readable; body access goes through verified RPCs below.
revoke select on public.chapters from anon, authenticated;
grant select (
  id, book_id, chapter_number, title, status, is_vip, price_coins,
  published_at, created_at, updated_at, moderation_state
) on public.chapters to anon, authenticated;

create or replace function private.can_read_chapter(p_user_id uuid, p_chapter_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_chapter public.chapters%rowtype;
  v_book public.books%rowtype;
  v_author public.authors%rowtype;
begin
  select * into v_chapter from public.chapters where id = p_chapter_id;
  if not found then return false; end if;

  select * into v_book from public.books where id = v_chapter.book_id;
  select * into v_author from public.authors where id = v_book.author_id;

  if p_user_id is not null and (
    v_author.user_id = p_user_id
    or exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'admin')
  ) then
    return true;
  end if;

  if v_chapter.status <> 'published'
     or v_chapter.moderation_state <> 'approved'
     or v_book.visibility <> 'public'
     or v_book.status = 'draft'
     or v_book.moderation_state <> 'approved'
     or v_author.moderation_state <> 'approved' then
    return false;
  end if;

  if v_book.is_vip and v_book.price_coins > 0 then
    return p_user_id is not null and exists (
      select 1 from public.book_entitlements e
      where e.user_id = p_user_id and e.book_id = v_book.id and e.revoked_at is null
    );
  end if;

  if v_chapter.is_vip and v_chapter.price_coins > 0 then
    return p_user_id is not null and (
      exists (
        select 1 from public.book_entitlements e
        where e.user_id = p_user_id and e.book_id = v_book.id and e.revoked_at is null
      )
      or exists (
        select 1 from public.chapter_entitlements e
        where e.user_id = p_user_id and e.chapter_id = v_chapter.id and e.revoked_at is null
      )
    );
  end if;

  return true;
end;
$$;

revoke execute on function private.can_read_chapter(uuid,uuid) from public;
grant execute on function private.can_read_chapter(uuid,uuid) to anon, authenticated;

create or replace function private.get_chapter_for_reading_impl(
  p_book_id uuid,
  p_chapter_number integer
)
returns table (
  id uuid,
  book_id uuid,
  chapter_number integer,
  title text,
  content text,
  status public.chapter_status,
  is_vip boolean,
  price_coins integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  lock_kind text,
  lock_price_coins integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_chapter public.chapters%rowtype;
  v_book public.books%rowtype;
  v_author public.authors%rowtype;
  v_user uuid := (select auth.uid());
  v_owner boolean := false;
  v_admin boolean := false;
  v_allowed boolean := false;
  v_lock_kind text := null;
  v_lock_price integer := 0;
begin
  select * into v_chapter
  from public.chapters c
  where c.book_id = p_book_id and c.chapter_number = p_chapter_number;

  if not found then return; end if;

  select * into v_book from public.books b where b.id = v_chapter.book_id;
  select * into v_author from public.authors a where a.id = v_book.author_id;

  v_owner := v_user is not null and v_author.user_id = v_user;
  v_admin := v_user is not null and exists (
    select 1 from public.profiles p where p.id = v_user and p.role = 'admin'
  );

  if v_owner or v_admin then
    v_allowed := true;
  elsif v_chapter.status = 'published'
        and v_chapter.moderation_state = 'approved'
        and v_book.visibility = 'public'
        and v_book.status <> 'draft'
        and v_book.moderation_state = 'approved'
        and v_author.moderation_state = 'approved' then
    if v_book.is_vip and v_book.price_coins > 0 then
      v_lock_kind := 'book';
      v_lock_price := v_book.price_coins;
      v_allowed := v_user is not null and exists (
        select 1 from public.book_entitlements e
        where e.user_id = v_user and e.book_id = v_book.id and e.revoked_at is null
      );
    elsif v_chapter.is_vip and v_chapter.price_coins > 0 then
      v_lock_kind := 'chapter';
      v_lock_price := v_chapter.price_coins;
      v_allowed := v_user is not null and (
        exists (
          select 1 from public.book_entitlements e
          where e.user_id = v_user and e.book_id = v_book.id and e.revoked_at is null
        )
        or exists (
          select 1 from public.chapter_entitlements e
          where e.user_id = v_user and e.chapter_id = v_chapter.id and e.revoked_at is null
        )
      );
    else
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    if v_lock_kind is not null then
      return query select
        v_chapter.id, v_chapter.book_id, v_chapter.chapter_number, v_chapter.title,
        null::text, v_chapter.status, v_chapter.is_vip, v_chapter.price_coins,
        v_chapter.published_at, v_chapter.created_at, v_chapter.updated_at,
        v_lock_kind, v_lock_price;
      return;
    end if;
    return;
  end if;

  return query select
    v_chapter.id, v_chapter.book_id, v_chapter.chapter_number, v_chapter.title,
    v_chapter.content, v_chapter.status, v_chapter.is_vip, v_chapter.price_coins,
    v_chapter.published_at, v_chapter.created_at, v_chapter.updated_at,
    null::text, 0::integer;
end;
$$;

revoke execute on function private.get_chapter_for_reading_impl(uuid,integer) from public;
grant execute on function private.get_chapter_for_reading_impl(uuid,integer) to anon, authenticated;

create or replace function public.get_chapter_for_reading(
  p_book_id uuid,
  p_chapter_number integer
)
returns table (
  id uuid,
  book_id uuid,
  chapter_number integer,
  title text,
  content text,
  status public.chapter_status,
  is_vip boolean,
  price_coins integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  lock_kind text,
  lock_price_coins integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_chapter_for_reading_impl(p_book_id, p_chapter_number);
$$;

grant execute on function public.get_chapter_for_reading(uuid,integer) to anon, authenticated;

create or replace function private.get_author_chapter_for_editing_impl(
  p_book_id uuid,
  p_chapter_id uuid
)
returns table (
  id uuid,
  book_id uuid,
  chapter_number integer,
  title text,
  content text,
  status public.chapter_status,
  is_vip boolean,
  price_coins integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.book_id, c.chapter_number, c.title, c.content, c.status,
    c.is_vip, c.price_coins, c.published_at, c.created_at, c.updated_at
  from public.chapters c
  join public.books b on b.id = c.book_id
  join public.authors a on a.id = b.author_id
  where c.id = p_chapter_id
    and c.book_id = p_book_id
    and (
      a.user_id = (select auth.uid())
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.role = 'admin'
      )
    );
$$;

revoke execute on function private.get_author_chapter_for_editing_impl(uuid,uuid) from public;
grant execute on function private.get_author_chapter_for_editing_impl(uuid,uuid) to authenticated;

create or replace function public.get_author_chapter_for_editing(
  p_book_id uuid,
  p_chapter_id uuid
)
returns table (
  id uuid,
  book_id uuid,
  chapter_number integer,
  title text,
  content text,
  status public.chapter_status,
  is_vip boolean,
  price_coins integer,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_author_chapter_for_editing_impl(p_book_id, p_chapter_id);
$$;

revoke execute on function public.get_author_chapter_for_editing(uuid,uuid) from public, anon;
grant execute on function public.get_author_chapter_for_editing(uuid,uuid) to authenticated;

create or replace function private.unlock_chapter_impl(
  p_chapter_id uuid,
  p_idempotency_key text
)
returns table (
  unlocked boolean,
  already_unlocked boolean,
  balance_coins bigint,
  price_paid_coins bigint,
  entitlement_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_chapter public.chapters%rowtype;
  v_book public.books%rowtype;
  v_author public.authors%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_ent public.chapter_entitlements%rowtype;
  v_tx uuid;
  v_price bigint;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_chapter from public.chapters where id = p_chapter_id;
  if not found then raise exception 'CHAPTER_NOT_FOUND'; end if;
  select * into v_book from public.books where id = v_chapter.book_id;
  select * into v_author from public.authors where id = v_book.author_id;

  if v_author.user_id = v_user or exists (select 1 from public.profiles p where p.id = v_user and p.role = 'admin') then
    select * into v_wallet from public.wallet_accounts where user_id = v_user;
    return query select true, true, coalesce(v_wallet.balance_coins,0), 0::bigint, null::uuid;
    return;
  end if;

  if v_book.is_vip and v_book.price_coins > 0 then
    raise exception 'BOOK_UNLOCK_REQUIRED';
  end if;

  if v_chapter.status <> 'published'
     or v_chapter.moderation_state <> 'approved'
     or v_book.visibility <> 'public'
     or v_book.status = 'draft'
     or v_book.moderation_state <> 'approved'
     or v_author.moderation_state <> 'approved' then
    raise exception 'CONTENT_NOT_AVAILABLE';
  end if;

  if not v_chapter.is_vip or v_chapter.price_coins <= 0 then
    select * into v_wallet from public.wallet_accounts where user_id = v_user;
    return query select true, true, coalesce(v_wallet.balance_coins,0), 0::bigint, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.book_entitlements e
    where e.user_id = v_user and e.book_id = v_book.id and e.revoked_at is null
  ) then
    select * into v_wallet from public.wallet_accounts where user_id = v_user;
    return query select true, true, coalesce(v_wallet.balance_coins,0), 0::bigint, null::uuid;
    return;
  end if;

  select * into v_wallet
  from public.wallet_accounts
  where user_id = v_user
  for update;

  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  select * into v_ent
  from public.chapter_entitlements e
  where e.user_id = v_user and e.chapter_id = p_chapter_id and e.revoked_at is null;

  if found then
    return query select true, true, v_wallet.balance_coins, v_ent.price_paid_coins, v_ent.id;
    return;
  end if;

  if exists (
    select 1 from public.wallet_transactions wt
    where wt.idempotency_key = p_idempotency_key
  ) then
    select * into v_ent
    from public.chapter_entitlements e
    where e.user_id = v_user and e.chapter_id = p_chapter_id and e.revoked_at is null;
    if found then
      return query select true, true, v_wallet.balance_coins, v_ent.price_paid_coins, v_ent.id;
      return;
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  v_price := v_chapter.price_coins;
  if v_wallet.balance_coins < v_price then raise exception 'INSUFFICIENT_COINS'; end if;

  update public.wallet_accounts w
  set balance_coins = w.balance_coins - v_price,
      lifetime_spent = w.lifetime_spent + v_price,
      updated_at = now()
  where w.user_id = v_user
  returning w.balance_coins into v_wallet.balance_coins;

  insert into public.wallet_transactions(
    user_id, type, amount_coins, balance_after, idempotency_key,
    reference_type, reference_id, description
  ) values (
    v_user, 'unlock_debit', -v_price, v_wallet.balance_coins, btrim(p_idempotency_key),
    'chapter', v_chapter.id, 'Mở khóa chương ' || v_chapter.chapter_number || ' · ' || v_book.title
  ) returning id into v_tx;

  insert into public.chapter_entitlements(
    user_id, chapter_id, book_id, source, price_paid_coins, wallet_transaction_id
  ) values (
    v_user, v_chapter.id, v_book.id, 'coin_unlock', v_price, v_tx
  ) returning * into v_ent;

  update public.author_revenue_accounts a
  set gross_sales_coins = a.gross_sales_coins + v_price,
      updated_at = now()
  where a.author_id = v_author.id;

  insert into public.author_revenue_ledger(
    author_id, type, gross_coins, book_id, chapter_id,
    chapter_entitlement_id, wallet_transaction_id, description
  ) values (
    v_author.id, 'sale', v_price, v_book.id, v_chapter.id,
    v_ent.id, v_tx, 'Mở khóa chương ' || v_chapter.chapter_number
  );

  return query select true, false, v_wallet.balance_coins, v_price, v_ent.id;
end;
$$;

revoke execute on function private.unlock_chapter_impl(uuid,text) from public;
grant execute on function private.unlock_chapter_impl(uuid,text) to authenticated;

create or replace function public.unlock_chapter(
  p_chapter_id uuid,
  p_idempotency_key text
)
returns table (
  unlocked boolean,
  already_unlocked boolean,
  balance_coins bigint,
  price_paid_coins bigint,
  entitlement_id uuid
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.unlock_chapter_impl(p_chapter_id, p_idempotency_key);
$$;

revoke execute on function public.unlock_chapter(uuid,text) from public, anon;
grant execute on function public.unlock_chapter(uuid,text) to authenticated;

create or replace function private.unlock_book_impl(
  p_book_id uuid,
  p_idempotency_key text
)
returns table (
  unlocked boolean,
  already_unlocked boolean,
  balance_coins bigint,
  price_paid_coins bigint,
  entitlement_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_book public.books%rowtype;
  v_author public.authors%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_ent public.book_entitlements%rowtype;
  v_tx uuid;
  v_price bigint;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_book from public.books where id = p_book_id;
  if not found then raise exception 'BOOK_NOT_FOUND'; end if;
  select * into v_author from public.authors where id = v_book.author_id;

  if v_author.user_id = v_user or exists (select 1 from public.profiles p where p.id = v_user and p.role = 'admin') then
    select * into v_wallet from public.wallet_accounts where user_id = v_user;
    return query select true, true, coalesce(v_wallet.balance_coins,0), 0::bigint, null::uuid;
    return;
  end if;

  if v_book.visibility <> 'public'
     or v_book.status = 'draft'
     or v_book.moderation_state <> 'approved'
     or v_author.moderation_state <> 'approved' then
    raise exception 'CONTENT_NOT_AVAILABLE';
  end if;

  if not v_book.is_vip or v_book.price_coins <= 0 then
    raise exception 'BOOK_NOT_FOR_SALE';
  end if;

  select * into v_wallet
  from public.wallet_accounts
  where user_id = v_user
  for update;

  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  select * into v_ent
  from public.book_entitlements e
  where e.user_id = v_user and e.book_id = p_book_id and e.revoked_at is null;

  if found then
    return query select true, true, v_wallet.balance_coins, v_ent.price_paid_coins, v_ent.id;
    return;
  end if;

  if exists (
    select 1 from public.wallet_transactions wt
    where wt.idempotency_key = p_idempotency_key
  ) then
    select * into v_ent
    from public.book_entitlements e
    where e.user_id = v_user and e.book_id = p_book_id and e.revoked_at is null;
    if found then
      return query select true, true, v_wallet.balance_coins, v_ent.price_paid_coins, v_ent.id;
      return;
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  v_price := v_book.price_coins;
  if v_wallet.balance_coins < v_price then raise exception 'INSUFFICIENT_COINS'; end if;

  update public.wallet_accounts w
  set balance_coins = w.balance_coins - v_price,
      lifetime_spent = w.lifetime_spent + v_price,
      updated_at = now()
  where w.user_id = v_user
  returning w.balance_coins into v_wallet.balance_coins;

  insert into public.wallet_transactions(
    user_id, type, amount_coins, balance_after, idempotency_key,
    reference_type, reference_id, description
  ) values (
    v_user, 'unlock_debit', -v_price, v_wallet.balance_coins, btrim(p_idempotency_key),
    'book', v_book.id, 'Mở khóa truyện · ' || v_book.title
  ) returning id into v_tx;

  insert into public.book_entitlements(
    user_id, book_id, source, price_paid_coins, wallet_transaction_id
  ) values (
    v_user, v_book.id, 'coin_unlock', v_price, v_tx
  ) returning * into v_ent;

  update public.author_revenue_accounts a
  set gross_sales_coins = a.gross_sales_coins + v_price,
      updated_at = now()
  where a.author_id = v_author.id;

  insert into public.author_revenue_ledger(
    author_id, type, gross_coins, book_id,
    book_entitlement_id, wallet_transaction_id, description
  ) values (
    v_author.id, 'sale', v_price, v_book.id,
    v_ent.id, v_tx, 'Mở khóa truyện'
  );

  return query select true, false, v_wallet.balance_coins, v_price, v_ent.id;
end;
$$;

revoke execute on function private.unlock_book_impl(uuid,text) from public;
grant execute on function private.unlock_book_impl(uuid,text) to authenticated;

create or replace function public.unlock_book(
  p_book_id uuid,
  p_idempotency_key text
)
returns table (
  unlocked boolean,
  already_unlocked boolean,
  balance_coins bigint,
  price_paid_coins bigint,
  entitlement_id uuid
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.unlock_book_impl(p_book_id, p_idempotency_key);
$$;

revoke execute on function public.unlock_book(uuid,text) from public, anon;
grant execute on function public.unlock_book(uuid,text) to authenticated;

commit;
