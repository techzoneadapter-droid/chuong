-- Two-tier economy. Legacy balances and prices retain their full value as low stones.
begin;
alter table public.wallet_accounts
  add column low_spirit_stones bigint generated always as (balance_coins) stored,
  add column high_spirit_stones bigint not null default 0 check (high_spirit_stones >= 0);
comment on column public.wallet_accounts.balance_coins is 'Compatibility alias for Hạ Phẩm; existing rewards and old clients remain valid.';
comment on column public.chapters.price_coins is 'Editable Hạ Phẩm price. Thượng Phẩm costs ceil(price_coins / 2).';
comment on column public.books.price_coins is 'Editable Hạ Phẩm price. Thượng Phẩm costs ceil(price_coins / 2).';
alter table public.wallet_transactions
  add column currency_type text not null default 'low' check (currency_type in ('low','high')),
  add column amount bigint generated always as (abs(amount_coins)) stored,
  add column direction text generated always as (case when amount_coins > 0 then 'in' else 'out' end) stored,
  add column source_type text generated always as (
    case
      when type = 'purchase_credit' then 'recharge'
      when type = 'unlock_debit' then 'vip_unlock'
      when type = 'gift_debit' then 'author_gift'
      when type in ('refund_credit','purchase_reversal_debit','refund_reversal_credit') then 'refund'
      when type = 'promo_credit' and metadata->>'quest_key' = 'rewarded_ad' then 'ad_reward'
      when type = 'promo_credit' and metadata->>'quest_key' = 'checkin' then 'daily_checkin'
      when type = 'promo_credit' then 'mission_reward'
      else 'admin_adjustment'
    end
  ) stored;
-- All historical ledger rows stay low; never relabel old paid balances as premium.
alter table public.store_purchases add column currency_type text not null default 'low' check (currency_type in ('low','high'));
alter table public.author_gifts add column currency_type text not null default 'low' check (currency_type in ('low','high'));
-- Keep revoked purchases for refund history; allow a later purchase in either currency.
alter table public.book_entitlements drop constraint book_entitlements_user_id_book_id_key;
alter table public.chapter_entitlements drop constraint chapter_entitlements_user_id_chapter_id_key;
create unique index book_entitlements_active_user_book_uq on public.book_entitlements(user_id,book_id) where revoked_at is null;
create unique index chapter_entitlements_active_user_chapter_uq on public.chapter_entitlements(user_id,chapter_id) where revoked_at is null;
create index wallet_transactions_user_currency_created_idx on public.wallet_transactions(user_id,currency_type,created_at desc);


create or replace function public.unlock_chapter_currency(
  p_chapter_id uuid,
  p_idempotency_key text,
  p_currency_type text
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
  v_balance bigint;
begin
  if p_currency_type is null or p_currency_type not in ('low','high') then raise exception 'INVALID_CURRENCY'; end if;
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
    return query select true, true, coalesce(case when p_currency_type = 'high' then v_wallet.high_spirit_stones else v_wallet.balance_coins end,0), 0::bigint, null::uuid;
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
    return query select true, true, coalesce(case when p_currency_type = 'high' then v_wallet.high_spirit_stones else v_wallet.balance_coins end,0), 0::bigint, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.book_entitlements e
    where e.user_id = v_user and e.book_id = v_book.id and e.revoked_at is null
  ) then
    select * into v_wallet from public.wallet_accounts where user_id = v_user;
    return query select true, true, coalesce(case when p_currency_type = 'high' then v_wallet.high_spirit_stones else v_wallet.balance_coins end,0), 0::bigint, null::uuid;
    return;
  end if;

  select * into v_wallet
  from public.wallet_accounts
  where user_id = v_user
  for update;

  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  v_balance := case when p_currency_type = 'high' then v_wallet.high_spirit_stones else v_wallet.balance_coins end;

  select * into v_ent
  from public.chapter_entitlements e
  where e.user_id = v_user and e.chapter_id = p_chapter_id and e.revoked_at is null;

  if found then
    return query select true, true, v_balance, v_ent.price_paid_coins, v_ent.id;
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
      return query select true, true, v_balance, v_ent.price_paid_coins, v_ent.id;
      return;
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  v_price := case when p_currency_type = 'high' then ceil(v_chapter.price_coins::numeric / 2)::bigint else v_chapter.price_coins end;
  if v_balance < v_price then raise exception 'INSUFFICIENT_COINS'; end if;

  update public.wallet_accounts w
  set balance_coins = w.balance_coins - case when p_currency_type = 'low' then v_price else 0 end,
      high_spirit_stones = w.high_spirit_stones - case when p_currency_type = 'high' then v_price else 0 end,
      lifetime_spent = w.lifetime_spent + v_price,
      updated_at = now()
  where w.user_id = v_user
  returning case when p_currency_type = 'high' then w.high_spirit_stones else w.balance_coins end into v_balance;

  insert into public.wallet_transactions(
    user_id, currency_type, type, amount_coins, balance_after, idempotency_key,
    reference_type, reference_id, description
  ) values (
    v_user, p_currency_type, 'unlock_debit', -v_price, v_balance, btrim(p_idempotency_key),
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

  return query select true, false, v_balance, v_price, v_ent.id;
end;
$$;
revoke all on function public.unlock_chapter_currency(uuid,text,text) from public, anon;
grant execute on function public.unlock_chapter_currency(uuid,text,text) to authenticated;

create or replace function private.unlock_chapter_impl(p_chapter_id uuid,p_idempotency_key text)
returns table(unlocked boolean,already_unlocked boolean,balance_coins bigint,price_paid_coins bigint,entitlement_id uuid)
language sql security definer set search_path = '' as $$
 select * from public.unlock_chapter_currency(p_chapter_id,p_idempotency_key,'low');
$$;

create or replace function public.unlock_book_currency(
  p_book_id uuid,
  p_idempotency_key text,
  p_currency_type text
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
  v_balance bigint;
begin
  if p_currency_type is null or p_currency_type not in ('low','high') then raise exception 'INVALID_CURRENCY'; end if;
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_book from public.books where id = p_book_id;
  if not found then raise exception 'BOOK_NOT_FOUND'; end if;
  select * into v_author from public.authors where id = v_book.author_id;

  if v_author.user_id = v_user or exists (select 1 from public.profiles p where p.id = v_user and p.role = 'admin') then
    select * into v_wallet from public.wallet_accounts where user_id = v_user;
    return query select true, true, coalesce(case when p_currency_type = 'high' then v_wallet.high_spirit_stones else v_wallet.balance_coins end,0), 0::bigint, null::uuid;
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
  v_balance := case when p_currency_type = 'high' then v_wallet.high_spirit_stones else v_wallet.balance_coins end;

  select * into v_ent
  from public.book_entitlements e
  where e.user_id = v_user and e.book_id = p_book_id and e.revoked_at is null;

  if found then
    return query select true, true, v_balance, v_ent.price_paid_coins, v_ent.id;
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
      return query select true, true, v_balance, v_ent.price_paid_coins, v_ent.id;
      return;
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  v_price := case when p_currency_type = 'high' then ceil(v_book.price_coins::numeric / 2)::bigint else v_book.price_coins end;
  if v_balance < v_price then raise exception 'INSUFFICIENT_COINS'; end if;

  update public.wallet_accounts w
  set balance_coins = w.balance_coins - case when p_currency_type = 'low' then v_price else 0 end,
      high_spirit_stones = w.high_spirit_stones - case when p_currency_type = 'high' then v_price else 0 end,
      lifetime_spent = w.lifetime_spent + v_price,
      updated_at = now()
  where w.user_id = v_user
  returning case when p_currency_type = 'high' then w.high_spirit_stones else w.balance_coins end into v_balance;

  insert into public.wallet_transactions(
    user_id, currency_type, type, amount_coins, balance_after, idempotency_key,
    reference_type, reference_id, description
  ) values (
    v_user, p_currency_type, 'unlock_debit', -v_price, v_balance, btrim(p_idempotency_key),
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

  return query select true, false, v_balance, v_price, v_ent.id;
end;
$$;
revoke all on function public.unlock_book_currency(uuid,text,text) from public, anon;
grant execute on function public.unlock_book_currency(uuid,text,text) to authenticated;

create or replace function private.unlock_book_impl(p_book_id uuid,p_idempotency_key text)
returns table(unlocked boolean,already_unlocked boolean,balance_coins bigint,price_paid_coins bigint,entitlement_id uuid)
language sql security definer set search_path = '' as $$
 select * from public.unlock_book_currency(p_book_id,p_idempotency_key,'low');
$$;

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

  if v_wallet.high_spirit_stones < v_amount then
    raise exception 'INSUFFICIENT_COINS';
  end if;

  v_author_earnings := floor((v_amount::numeric * v_policy.author_share_bps::numeric) / 10000)::bigint;
  v_platform_share := v_amount - v_author_earnings;

  update public.wallet_accounts w
  set high_spirit_stones = w.high_spirit_stones - v_amount,
      lifetime_spent = w.lifetime_spent + v_amount,
      updated_at = now()
  where w.user_id = v_uid
  returning w.high_spirit_stones into v_wallet.high_spirit_stones;

  insert into public.wallet_transactions(
    user_id, currency_type, type, amount_coins, balance_after,
    idempotency_key, reference_type, reference_id, description,
    metadata
  ) values (
    v_uid,
    'high',
    'gift_debit'::public.wallet_transaction_type,
    -v_amount,
    v_wallet.high_spirit_stones,
    btrim(p_idempotency_key),
    'author_gift',
    v_gift_id,
    'Tặng quà tác giả · ' || v_book.title,
    jsonb_build_object('gift_key', p_gift_key, 'author_id', v_author.id, 'book_id', v_book.id)
  )
  returning id into v_tx_id;

  insert into public.author_gifts(
    id, sender_user_id, author_id, book_id, gift_key, amount_coins, currency_type,
    author_share_bps, author_earnings_coins, platform_share_coins,
    wallet_transaction_id
  ) values (
    v_gift_id, v_uid, v_author.id, v_book.id, p_gift_key, v_amount, 'high',
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
    v_wallet.high_spirit_stones,
    v_author_earnings,
    v_platform_share,
    false;
end;
$$;

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
    state, provider_payload, currency_type
  ) values (
    p_user_id, p_provider, v_product.id, btrim(p_external_transaction_id), btrim(p_receipt_hash),
    'verified', coalesce(p_provider_payload, '{}'::jsonb), 'high'
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
      high_spirit_stones = w.high_spirit_stones + v_balance_credit,
      lifetime_credited = w.lifetime_credited + v_product.coins,
      updated_at = now()
  where w.user_id = p_user_id
  returning * into v_wallet;

  if v_balance_credit > 0 then
    insert into public.wallet_transactions(
      user_id, currency_type, type, amount_coins, balance_after, idempotency_key,
      reference_type, reference_id, description, metadata
    ) values (
      p_user_id, 'high', 'purchase_credit', v_balance_credit, v_wallet.high_spirit_stones,
      'store:' || p_provider::text || ':' || btrim(p_external_transaction_id) || ':credit',
      'store_purchase', v_purchase.id,
      'Nạp Thượng Phẩm Linh Thạch qua ' || case when p_provider='google_play' then 'Google Play' else 'App Store' end,
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

    v_remove_from_balance := least((case when v_purchase.currency_type = 'high' then v_wallet.high_spirit_stones else v_wallet.balance_coins end), v_purchase.coins_to_balance);
    v_add_debt := v_purchase.coins_to_debt + (v_purchase.coins_to_balance - v_remove_from_balance);

    update public.wallet_accounts w
    set balance_coins = w.balance_coins - case when v_purchase.currency_type = 'low' then v_remove_from_balance else 0 end,
      high_spirit_stones = w.high_spirit_stones - case when v_purchase.currency_type = 'high' then v_remove_from_balance else 0 end,
        debt_coins = w.debt_coins + v_add_debt,
        lifetime_reversed = w.lifetime_reversed + v_purchase.coins_granted,
        updated_at = now()
    where w.user_id = v_purchase.user_id
    returning * into v_wallet;

    if v_remove_from_balance > 0 then
      insert into public.wallet_transactions(
        user_id, currency_type, type, amount_coins, balance_after, idempotency_key,
        reference_type, reference_id, description, metadata
      ) values (
        v_purchase.user_id, v_purchase.currency_type, 'purchase_reversal_debit', -v_remove_from_balance,
        (case when v_purchase.currency_type = 'high' then v_wallet.high_spirit_stones else v_wallet.balance_coins end),
        'store:' || p_provider::text || ':' || btrim(p_external_transaction_id) || ':revoke',
        'store_purchase', v_purchase.id,
        'Thu hồi do giao dịch cửa hàng bị hoàn/hủy',
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
      balance_coins = w.balance_coins + case when v_purchase.currency_type = 'low' then v_balance_credit else 0 end,
      high_spirit_stones = w.high_spirit_stones + case when v_purchase.currency_type = 'high' then v_balance_credit else 0 end,
      lifetime_reversed = greatest(0, w.lifetime_reversed - v_purchase.coins_granted),
      updated_at = now()
  where w.user_id = v_purchase.user_id
  returning * into v_wallet;

  if v_balance_credit > 0 then
    insert into public.wallet_transactions(
      user_id, currency_type, type, amount_coins, balance_after, idempotency_key,
      reference_type, reference_id, description, metadata
    ) values (
      v_purchase.user_id,
      v_purchase.currency_type,
      'refund_reversal_credit',
      v_balance_credit,
      (case when v_purchase.currency_type = 'high' then v_wallet.high_spirit_stones else v_wallet.balance_coins end),
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
  v_currency text := 'low';
  v_original_tx uuid;
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
    select e.user_id, e.book_id, null::uuid, e.price_paid_coins, e.revoked_at, e.wallet_transaction_id
      into v_user, v_book, v_chapter, v_price, v_revoked, v_original_tx
    from public.book_entitlements e
    where e.id = p_entitlement_id
    for update;
  else
    select e.user_id, e.book_id, e.chapter_id, e.price_paid_coins, e.revoked_at, e.wallet_transaction_id
      into v_user, v_book, v_chapter, v_price, v_revoked, v_original_tx
    from public.chapter_entitlements e
    where e.id = p_entitlement_id
    for update;
  end if;

  if v_user is null then raise exception 'ENTITLEMENT_NOT_FOUND'; end if;
  select coalesce(wt.currency_type,'low') into v_currency from public.wallet_transactions wt where wt.id = v_original_tx;
  v_currency := coalesce(v_currency,'low');

  if v_revoked is not null then
    select wt.* into v_existing
    from public.wallet_transactions wt
    where wt.reference_type = 'refund_entitlement'
      and wt.reference_id = p_entitlement_id
    order by wt.created_at desc
    limit 1;

    return query select
      coalesce(greatest(v_existing.amount_coins, 0), 0),
      coalesce(v_existing.balance_after, (select case when v_currency = 'high' then w.high_spirit_stones else w.balance_coins end from public.wallet_accounts w where w.user_id = v_user)),
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
    set balance_coins = w.balance_coins + case when v_currency = 'low' then v_price else 0 end,
        high_spirit_stones = w.high_spirit_stones + case when v_currency = 'high' then v_price else 0 end,
        lifetime_credited = w.lifetime_credited + v_price,
        updated_at = now()
    where w.user_id = v_user
    returning * into v_wallet;

    insert into public.wallet_transactions(
      user_id, currency_type, type, amount_coins, balance_after, idempotency_key,
      reference_type, reference_id, description
    ) values (
      v_user, v_currency, 'refund_credit', v_price, (case when v_currency = 'high' then v_wallet.high_spirit_stones else v_wallet.balance_coins end), btrim(p_idempotency_key),
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

  return query select v_price, (case when v_currency = 'high' then v_wallet.high_spirit_stones else v_wallet.balance_coins end), v_refund_tx, false;
end;
$$;

create or replace function public.get_book_gift_summary(p_book_id uuid)
returns table (
  total_gifts bigint,
  total_coins bigint
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    case when eligible.ok then count(g.id) else 0 end::bigint as total_gifts,
    case when eligible.ok then coalesce(sum(g.amount_coins),0) else 0 end::bigint as total_coins
  from (
    select exists (
      select 1
      from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = p_book_id
        and b.visibility = 'public'
        and b.status <> 'draft'
        and b.moderation_state = 'approved'
        and a.moderation_state = 'approved'
    ) as ok
  ) eligible
  left join public.author_gifts g on g.book_id = p_book_id and g.currency_type = 'high'
  group by eligible.ok;
$$;

alter table public.author_revenue_ledger add column currency_type text not null default 'low' check (currency_type in ('low','high'));
create or replace function private.set_revenue_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.wallet_transaction_id is not null then
    select wt.currency_type into new.currency_type from public.wallet_transactions wt where wt.id = new.wallet_transaction_id;
    new.currency_type := coalesce(new.currency_type,'low');
  end if;
  return new;
end;
$$;
revoke all on function private.set_revenue_currency() from public, anon, authenticated;
create trigger author_revenue_currency before insert on public.author_revenue_ledger for each row execute function private.set_revenue_currency();

-- The author gift dashboard keeps legacy low gifts separate from new premium gifts.
create or replace function public.get_my_author_gifts()
returns jsonb language sql security invoker set search_path = '' stable as $$
  select jsonb_build_object(
    'totalHigh', coalesce(sum(g.amount_coins) filter (where g.currency_type = 'high'),0),
    'totalLow', coalesce(sum(g.amount_coins) filter (where g.currency_type = 'low'),0),
    'count', count(g.id),
    'recent', coalesce((
      select jsonb_agg(row_to_json(r)) from (
        select ag.id,ag.amount_coins,ag.currency_type,ag.gift_key,ag.created_at,b.title as book_title
        from public.author_gifts ag join public.authors a on a.id = ag.author_id
        left join public.books b on b.id = ag.book_id
        where a.user_id = (select auth.uid()) order by ag.created_at desc limit 10
      ) r
    ),'[]'::jsonb)
  ) from public.author_gifts g join public.authors a on a.id = g.author_id
  where a.user_id = (select auth.uid());
$$;
revoke all on function public.get_my_author_gifts() from public, anon;
grant execute on function public.get_my_author_gifts() to authenticated;

create or replace function public.admin_adjust_wallet_currency(
  p_user_id uuid,
  p_amount bigint,
  p_reason text,
  p_idempotency_key text,
  p_currency_type text
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
  if p_currency_type is null or p_currency_type not in ('low','high') then raise exception 'INVALID_CURRENCY'; end if;
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
    from public.wallet_transactions wt
    where wt.idempotency_key = p_idempotency_key;

    if found then
      if v_existing.user_id <> p_user_id or v_existing.amount_coins <> p_amount or v_existing.currency_type <> p_currency_type then
        raise exception 'Idempotency key already used for a different transaction';
      end if;
      return query select v_existing.balance_after, v_existing.id;
      return;
    end if;
  end if;

  select case when p_currency_type = 'high' then w.high_spirit_stones else w.balance_coins end into v_balance
  from public.wallet_accounts w
  where w.user_id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'Wallet not found';
  end if;

  if v_balance + p_amount < 0 then
    raise exception 'Insufficient wallet balance';
  end if;

  update public.wallet_accounts as w
  set
    balance_coins = w.balance_coins + case when p_currency_type = 'low' then p_amount else 0 end,
    high_spirit_stones = w.high_spirit_stones + case when p_currency_type = 'high' then p_amount else 0 end,
    lifetime_credited = w.lifetime_credited + greatest(p_amount, 0),
    lifetime_spent = w.lifetime_spent + greatest(-p_amount, 0),
    updated_at = now()
  where w.user_id = p_user_id
  returning case when p_currency_type = 'high' then w.high_spirit_stones else w.balance_coins end into v_balance;

  v_type := case when p_amount > 0 then 'admin_credit'::public.wallet_transaction_type
                 else 'admin_debit'::public.wallet_transaction_type end;

  insert into public.wallet_transactions(
    user_id, currency_type, type, amount_coins, balance_after,
    idempotency_key, reference_type, description
  )
  values (
    p_user_id, p_currency_type, v_type, p_amount, v_balance,
    nullif(btrim(p_idempotency_key), ''), 'admin_adjustment', btrim(p_reason)
  )
  returning id into v_tx_id;

  return query select v_balance, v_tx_id;
end;
$$;
revoke all on function public.admin_adjust_wallet_currency(uuid,bigint,text,text,text) from public, anon;
grant execute on function public.admin_adjust_wallet_currency(uuid,bigint,text,text,text) to authenticated;
create or replace function private.credit_daily_cultivation_reward(p_user_id uuid,p_date date,p_quest_key text,p_reward integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_balance bigint; v_tx_key text := 'daily:'||p_user_id::text||':'||p_date::text||':'||p_quest_key;
begin
  insert into public.wallet_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select balance_coins into v_balance from public.wallet_accounts where user_id=p_user_id for update;
  if exists(select 1 from public.wallet_transactions wt where wt.idempotency_key=v_tx_key) then return v_balance; end if;
  update public.wallet_accounts
    set balance_coins=balance_coins+p_reward,lifetime_credited=lifetime_credited+p_reward,updated_at=now()
    where user_id=p_user_id returning balance_coins into v_balance;
  insert into public.wallet_transactions(user_id,type,amount_coins,balance_after,idempotency_key,reference_type,description,metadata)
  values(
    p_user_id,'promo_credit'::public.wallet_transaction_type,p_reward,v_balance,v_tx_key,'daily_cultivation',
    case p_quest_key
      when 'checkin' then 'Điểm danh tu luyện hằng ngày'
      when 'read_10m' then 'Nhiệm vụ đọc 10 phút'
      when 'complete_3' then 'Nhiệm vụ hoàn thành 3 chương'
      when 'review_1' then 'Nhiệm vụ đánh giá truyện'
      when 'rewarded_ad' then 'Quảng cáo thưởng hằng ngày'
      else 'Nhiệm vụ tu luyện hằng ngày'
    end,
    jsonb_build_object('quest_date',p_date,'quest_key',p_quest_key)
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  return v_balance;
end;
$$;
revoke all on function private.credit_daily_cultivation_reward(uuid,date,text,integer) from public, anon, authenticated;
create or replace function public.get_daily_cultivation()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_uid uuid := (select auth.uid());
  v_date date := (timezone('UTC',now()))::date;
  v_read integer := 0; v_completed integer := 0; v_reviews integer := 0;
  v_streak integer := 0; v_balance bigint := 0; v_claimed text[] := array[]::text[];
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;

  select m.read_seconds,m.chapters_completed,m.reviews_created
  into v_read,v_completed,v_reviews
  from private.daily_cultivation_metrics(v_uid,v_date) m;

  select coalesce(max(d.streak_count),0) into v_streak
  from public.daily_cultivation_days d
  where d.user_id=v_uid and d.quest_date in(v_date,v_date-1) and d.checkin_claimed_at is not null;

  select coalesce(array_agg(c.quest_key order by c.quest_key),array[]::text[]) into v_claimed
  from public.daily_cultivation_claims c
  where c.user_id=v_uid and c.quest_date=v_date;

  select coalesce(w.balance_coins,0) into v_balance
  from public.wallet_accounts w where w.user_id=v_uid;

  return jsonb_build_object(
    'date',v_date,'streak',v_streak,'balance',v_balance,
    'earnedToday',coalesce((select sum(c.reward_coins) from public.daily_cultivation_claims c where c.user_id=v_uid and c.quest_date=v_date),0),
    'quests',jsonb_build_array(
      jsonb_build_object('key','checkin','title','Điểm danh hôm nay','description','Mở CHƯƠNG và nhận Hạ Phẩm Linh Thạch mỗi ngày.','progress',case when 'checkin'=any(v_claimed) then 1 else 0 end,'target',1,'reward',5,'eligible',true,'claimed','checkin'=any(v_claimed)),
      jsonb_build_object('key','read_10m','title','Đọc 10 phút','description','Thời gian đọc thật được hệ thống ghi nhận.','progress',least(v_read,600),'target',600,'reward',5,'eligible',v_read>=600,'claimed','read_10m'=any(v_claimed)),
      jsonb_build_object('key','complete_3','title','Hoàn thành 3 chương','description','Đọc đến ít nhất 90% của 3 chương khác nhau.','progress',least(v_completed,3),'target',3,'reward',5,'eligible',v_completed>=3,'claimed','complete_3'=any(v_claimed)),
      jsonb_build_object('key','review_1','title','Đánh giá 1 truyện','description','Tạo một đánh giá mới được duyệt trong hôm nay.','progress',least(v_reviews,1),'target',1,'reward',3,'eligible',v_reviews>=1,'claimed','review_1'=any(v_claimed)),
      jsonb_build_object('key','rewarded_ad','title','Xem quảng cáo nhận thưởng','description','Xem hết một quảng cáo thưởng để nhận Hạ Phẩm Linh Thạch. Tối đa 1 lần mỗi ngày.','progress',case when 'rewarded_ad'=any(v_claimed) then 1 else 0 end,'target',1,'reward',10,'eligible',true,'claimed','rewarded_ad'=any(v_claimed))
    )
  );
end;
$$;
revoke all on function public.get_daily_cultivation() from public, anon;
grant execute on function public.get_daily_cultivation() to authenticated;
commit;
