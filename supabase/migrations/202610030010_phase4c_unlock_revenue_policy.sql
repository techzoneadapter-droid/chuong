-- CHUONG Phase 4C: attach active revenue-share snapshot to new unlock sales
begin;

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

  perform private.record_author_sale(
    v_author.id,
    v_price,
    v_book.id,
    v_chapter.id,
    null,
    v_ent.id,
    v_tx,
    'Mở khóa chương ' || v_chapter.chapter_number
  );

  return query select true, false, v_wallet.balance_coins, v_price, v_ent.id;
end;
$$;

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

  perform private.record_author_sale(
    v_author.id,
    v_price,
    v_book.id,
    null,
    v_ent.id,
    null,
    v_tx,
    'Mở khóa truyện'
  );

  return query select true, false, v_wallet.balance_coins, v_price, v_ent.id;
end;
$$;

commit;
