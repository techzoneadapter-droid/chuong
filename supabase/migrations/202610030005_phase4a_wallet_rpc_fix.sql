-- CHUONG Phase 4A: fix admin wallet adjustment ambiguity
begin;

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
    from public.wallet_transactions wt
    where wt.idempotency_key = p_idempotency_key;

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

  update public.wallet_accounts as w
  set
    balance_coins = w.balance_coins + p_amount,
    lifetime_credited = w.lifetime_credited + greatest(p_amount, 0),
    lifetime_spent = w.lifetime_spent + greatest(-p_amount, 0),
    updated_at = now()
  where w.user_id = p_user_id
  returning w.balance_coins into v_balance;

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
