-- CHUONG: rename user-facing virtual currency to Linh Thach
begin;

update public.store_products
set
  google_product_id = case sku
    when 'coins_100' then 'chuong.linhthach.100'
    when 'coins_550' then 'chuong.linhthach.550'
    when 'coins_1200' then 'chuong.linhthach.1200'
    when 'coins_2600' then 'chuong.linhthach.2600'
    else google_product_id
  end,
  apple_product_id = case sku
    when 'coins_100' then 'chuong.linhthach.100'
    when 'coins_550' then 'chuong.linhthach.550'
    when 'coins_1200' then 'chuong.linhthach.1200'
    when 'coins_2600' then 'chuong.linhthach.2600'
    else apple_product_id
  end,
  updated_at = now()
where sku in ('coins_100','coins_550','coins_1200','coins_2600');

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
      'Nạp Linh Thạch qua ' || case when p_provider='google_play' then 'Google Play' else 'App Store' end,
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
        'Thu hồi Linh Thạch do giao dịch cửa hàng bị hoàn/hủy',
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

commit;
