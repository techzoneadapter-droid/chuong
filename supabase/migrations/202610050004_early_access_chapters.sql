-- CHUONG Phase 4N1: "Tiên Cơ" early-access chapters.
-- A chapter may be temporarily coin-locked until early_access_until.
-- After that timestamp it becomes free automatically without a cron job.
begin;

alter table public.chapters
  add column if not exists early_access_until timestamptz;

alter table public.chapters
  drop constraint if exists chapters_early_access_requires_paid_vip;
alter table public.chapters
  add constraint chapters_early_access_requires_paid_vip
  check (
    early_access_until is null
    or (is_vip = true and price_coins > 0)
  );

create index if not exists chapters_early_access_until_idx
  on public.chapters (early_access_until)
  where early_access_until is not null;

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

  if v_chapter.is_vip
     and v_chapter.price_coins > 0
     and (v_chapter.early_access_until is null or v_chapter.early_access_until > now()) then
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

create or replace function private.get_chapter_for_reading_impl(p_book_id uuid, p_chapter_number integer)
returns table(
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
    elsif v_chapter.is_vip
          and v_chapter.price_coins > 0
          and (v_chapter.early_access_until is null or v_chapter.early_access_until > now()) then
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

  -- Expired Tiên Cơ chapters are free immediately. No scheduler is required.
  if not v_chapter.is_vip
     or v_chapter.price_coins <= 0
     or (v_chapter.early_access_until is not null and v_chapter.early_access_until <= now()) then
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
    'chapter', v_chapter.id,
    case when v_chapter.early_access_until is not null
      then 'Đọc sớm Tiên Cơ · Chương ' || v_chapter.chapter_number || ' · ' || v_book.title
      else 'Mở khóa chương ' || v_chapter.chapter_number || ' · ' || v_book.title
    end
  ) returning id into v_tx;

  insert into public.chapter_entitlements(
    user_id, chapter_id, book_id, source, price_paid_coins, wallet_transaction_id
  ) values (
    v_user, v_chapter.id, v_book.id, 'coin_unlock', v_price, v_tx
  ) returning * into v_ent;

  perform private.record_author_sale(
    v_author.id,
    v_price,
    v_book.id,
    v_chapter.id,
    null,
    v_ent.id,
    v_tx,
    case when v_chapter.early_access_until is not null
      then 'Đọc sớm Tiên Cơ · Chương ' || v_chapter.chapter_number
      else 'Mở khóa chương ' || v_chapter.chapter_number
    end
  );

  return query select true, false, v_wallet.balance_coins, v_price, v_ent.id;
end;
$$;

revoke execute on function private.can_read_chapter(uuid,uuid) from public, anon, authenticated;
revoke execute on function private.get_chapter_for_reading_impl(uuid,integer) from public, anon, authenticated;
revoke execute on function private.unlock_chapter_impl(uuid,text) from public, anon;
grant execute on function private.unlock_chapter_impl(uuid,text) to authenticated;

commit;