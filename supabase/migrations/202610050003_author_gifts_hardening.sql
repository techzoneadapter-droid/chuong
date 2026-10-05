-- CHUONG Phase 4M1: harden gift idempotency and daily limit serialization.
begin;

create or replace function public.send_author_gift(
  p_book_id uuid,
  p_gift_key text,
  p_idempotency_key text
)
returns table (
  gift_id uuid,
  amount_coins bigint,
  balance_coins bigint,
  author_earnings_coins bigint,
  platform_share_coins bigint,
  already_sent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_book public.books%rowtype;
  v_author public.authors%rowtype;
  v_wallet public.wallet_accounts%rowtype;
  v_policy public.revenue_share_policies%rowtype;
  v_amount bigint;
  v_author_earnings bigint;
  v_platform_share bigint;
  v_gift_id uuid := gen_random_uuid();
  v_tx_id uuid;
  v_existing_tx public.wallet_transactions%rowtype;
  v_existing_gift public.author_gifts%rowtype;
  v_today_gifts bigint := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  v_amount := case p_gift_key
    when 'linh_hoa' then 10
    when 'tien_dan' then 50
    when 'ngoc_boi' then 100
    when 'linh_kiem' then 500
    else null
  end;

  if v_amount is null then
    raise exception 'INVALID_GIFT';
  end if;

  select * into v_existing_tx
  from public.wallet_transactions wt
  where wt.idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing_tx.user_id <> v_uid or v_existing_tx.reference_type <> 'author_gift' then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;

    select * into v_existing_gift
    from public.author_gifts g
    where g.wallet_transaction_id = v_existing_tx.id;

    if not found
       or v_existing_gift.sender_user_id <> v_uid
       or v_existing_gift.book_id <> p_book_id
       or v_existing_gift.gift_key <> p_gift_key
       or v_existing_gift.amount_coins <> v_amount then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;

    return query select
      v_existing_gift.id,
      v_existing_gift.amount_coins,
      v_existing_tx.balance_after,
      v_existing_gift.author_earnings_coins,
      v_existing_gift.platform_share_coins,
      true;
    return;
  end if;

  select * into v_book from public.books b where b.id = p_book_id;
  if not found then raise exception 'BOOK_NOT_FOUND'; end if;

  select * into v_author from public.authors a where a.id = v_book.author_id;
  if not found then raise exception 'AUTHOR_NOT_FOUND'; end if;

  if v_author.user_id = v_uid then
    raise exception 'SELF_GIFT_NOT_ALLOWED';
  end if;

  if v_book.visibility <> 'public'
     or v_book.status = 'draft'
     or v_book.moderation_state <> 'approved'
     or v_author.moderation_state <> 'approved' then
    raise exception 'CONTENT_NOT_AVAILABLE';
  end if;

  select * into v_policy
  from public.revenue_share_policies p
  where p.active = true
    and p.effective_at <= now()
    and (p.ended_at is null or p.ended_at > now())
  order by p.effective_at desc
  limit 1;

  if not found then
    raise exception 'REVENUE_POLICY_UNAVAILABLE';
  end if;

  select * into v_wallet
  from public.wallet_accounts w
  where w.user_id = v_uid
  for update;

  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  select coalesce(sum(g.amount_coins), 0)
  into v_today_gifts
  from public.author_gifts g
  where g.sender_user_id = v_uid
    and g.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';

  if v_today_gifts + v_amount > 10000 then
    raise exception 'DAILY_GIFT_LIMIT';
  end if;

  if v_wallet.balance_coins < v_amount then
    raise exception 'INSUFFICIENT_COINS';
  end if;

  v_author_earnings := floor((v_amount::numeric * v_policy.author_share_bps::numeric) / 10000)::bigint;
  v_platform_share := v_amount - v_author_earnings;

  update public.wallet_accounts w
  set balance_coins = w.balance_coins - v_amount,
      lifetime_spent = w.lifetime_spent + v_amount,
      updated_at = now()
  where w.user_id = v_uid
  returning w.balance_coins into v_wallet.balance_coins;

  insert into public.wallet_transactions(
    user_id, type, amount_coins, balance_after,
    idempotency_key, reference_type, reference_id, description,
    metadata
  ) values (
    v_uid,
    'gift_debit'::public.wallet_transaction_type,
    -v_amount,
    v_wallet.balance_coins,
    btrim(p_idempotency_key),
    'author_gift',
    v_gift_id,
    'Tặng quà tác giả · ' || v_book.title,
    jsonb_build_object('gift_key', p_gift_key, 'author_id', v_author.id, 'book_id', v_book.id)
  )
  returning id into v_tx_id;

  insert into public.author_gifts(
    id, sender_user_id, author_id, book_id, gift_key, amount_coins,
    author_share_bps, author_earnings_coins, platform_share_coins,
    wallet_transaction_id
  ) values (
    v_gift_id, v_uid, v_author.id, v_book.id, p_gift_key, v_amount,
    v_policy.author_share_bps, v_author_earnings, v_platform_share, v_tx_id
  );

  insert into public.author_revenue_accounts(author_id)
  values(v_author.id)
  on conflict(author_id) do nothing;

  update public.author_revenue_accounts a
  set gross_gifts_coins = a.gross_gifts_coins + v_amount,
      author_earnings_coins = a.author_earnings_coins + v_author_earnings,
      updated_at = now()
  where a.author_id = v_author.id;

  insert into public.author_revenue_ledger(
    author_id, type, gross_coins, book_id, chapter_id,
    book_entitlement_id, chapter_entitlement_id, wallet_transaction_id,
    share_policy_id, author_share_bps, author_earnings_coins,
    platform_share_coins, description
  ) values (
    v_author.id,
    'gift'::public.author_revenue_type,
    v_amount,
    v_book.id,
    null,
    null,
    null,
    v_tx_id,
    v_policy.id,
    v_policy.author_share_bps,
    v_author_earnings,
    v_platform_share,
    'Quà độc giả · ' || p_gift_key
  );

  return query select
    v_gift_id,
    v_amount,
    v_wallet.balance_coins,
    v_author_earnings,
    v_platform_share,
    false;
end;
$$;

revoke execute on function public.send_author_gift(uuid,text,text) from public, anon;
grant execute on function public.send_author_gift(uuid,text,text) to authenticated;

commit;