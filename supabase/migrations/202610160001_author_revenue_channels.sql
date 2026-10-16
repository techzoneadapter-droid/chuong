-- Add read-only, all-history author earning channels without changing balances, payout rules or revenue shares.
-- High stones: verified store top-ups subsequently spent on chapters/books or gifts.
-- Low stones: credits earned from rewarded ads OR free quests; only show VND after an actual
--   revenue pool is settled by Admin. Never claim a fixed VND rate per low stone.
-- Null/unpriced historical rows remain pending and are not reported as earned VND.
begin;
create or replace function public.get_author_vnd_dashboard(p_author_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.author_payout_policies%rowtype; total bigint; paid bigint; reserved bigint;
begin
 if not private.is_admin() and not exists(select 1 from public.authors where id=p_author_id and user_id=auth.uid()) then raise exception 'AUTHOR_ACCESS_REQUIRED' using errcode='42501'; end if;
 select * into p from public.author_payout_policies order by created_at desc,id desc limit 1;
 select coalesce(sum(author_earnings_vnd),0) into total from public.author_vnd_ledger where author_id=p_author_id;
 select coalesce(sum(requested_vnd) filter(where status='paid'),0),coalesce(sum(requested_vnd) filter(where status in ('pending','approved')),0) into paid,reserved from public.author_payouts where author_id=p_author_id;
 return jsonb_build_object('policy',to_jsonb(p),'total_vnd',total,'paid_vnd',paid,'reserved_vnd',reserved,'available_payout_vnd',greatest(0,total-paid-reserved),'debt_vnd',greatest(0,paid+reserved-total),
 'pending_count',(select count(*) from public.author_vnd_ledger l where author_id=p_author_id and entry_type='sale' and settlement_status<>'settled' and not exists(select 1 from public.author_vnd_ledger x where x.original_id=l.id)),
 'pending_low_stones',(select coalesce(sum(stones_spent),0) from public.author_vnd_ledger l where author_id=p_author_id and currency_type='low' and entry_type='sale' and not exists(select 1 from public.author_vnd_ledger x where x.original_id=l.id)),
 'revenue_channels',(select jsonb_build_object(
  'paid_unlock_vnd',coalesce(sum(author_earnings_vnd) filter (where currency_type='high' and source_type in ('chapter_unlock','book_unlock')),0),
  'paid_gift_vnd',coalesce(sum(author_earnings_vnd) filter (where currency_type='high' and source_type='author_gift'),0),
  'low_pool_vnd',coalesce(sum(author_earnings_vnd) filter (where currency_type='low'),0)
 ) from public.author_vnd_ledger where author_id=p_author_id),
 'breakdown',(select coalesce(jsonb_object_agg(source_type,value),'{}') from (select source_type,sum(author_earnings_vnd) value from public.author_vnd_ledger where author_id=p_author_id group by source_type) b),
 'ledger',(select coalesce(jsonb_agg(to_jsonb(l) order by created_at desc),'[]') from (select * from public.author_vnd_ledger where author_id=p_author_id order by created_at desc limit 100) l));
end; $$;
commit;
