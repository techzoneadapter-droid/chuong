-- CHUONG Phase 4L2: label rewarded-ad wallet credits correctly
begin;

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

commit;