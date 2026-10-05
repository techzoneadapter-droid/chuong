-- Forward-only VND accounting; the existing two-tier wallet remains authoritative.
begin;
create table public.author_payout_policies (
 id uuid primary key default gen_random_uuid(),
 high_stone_value_vnd bigint check(high_stone_value_vnd > 0),
 chapter_author_bps integer not null default 6000 check(chapter_author_bps between 0 and 10000),
 book_author_bps integer not null default 6000 check(book_author_bps between 0 and 10000),
 gift_author_bps integer not null default 8000 check(gift_author_bps between 0 and 10000),
 low_creator_pool_bps integer not null default 6000 check(low_creator_pool_bps between 0 and 10000),
 app_vip_author_bps integer not null default 0 check(app_vip_author_bps = 0),
 minimum_withdrawal_vnd bigint not null default 1 check(minimum_withdrawal_vnd > 0),
 withdrawal_fee_vnd bigint not null default 0 check(withdrawal_fee_vnd >= 0),
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default clock_timestamp()
);
insert into public.author_payout_policies default values; -- Deliberately no invented exchange rate.
alter table public.author_payout_policies enable row level security;
create policy read_payout_policy on public.author_payout_policies for select to authenticated using(true);
grant select on public.author_payout_policies to authenticated;

create table public.author_vnd_ledger (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.authors(id),
 user_id uuid references public.profiles(id),
 source_type text not null check(source_type in ('chapter_unlock','book_unlock','author_gift')),
 source_reference_id uuid not null,
 currency_type text not null check(currency_type in ('low','high')),
 stones_spent bigint not null check(stones_spent > 0),
 entry_type text not null default 'sale' check(entry_type in ('sale','settlement','reversal')),
 original_id uuid references public.author_vnd_ledger(id),
 payout_policy_id uuid references public.author_payout_policies(id),
 stone_value_vnd_snapshot bigint check(stone_value_vnd_snapshot > 0),
 gross_value_vnd bigint,
 author_share_bps_snapshot integer check(author_share_bps_snapshot between 0 and 10000),
 author_earnings_vnd bigint,
 platform_earnings_vnd bigint,
 settlement_status text not null check(settlement_status in ('settled','pending_settlement','legacy_pending_settlement')),
 description text,
 created_at timestamptz not null default now(),
 check((entry_type = 'sale' and original_id is null) or (entry_type <> 'sale' and original_id is not null)),
 check((settlement_status = 'settled' and gross_value_vnd is not null and author_earnings_vnd is not null and platform_earnings_vnd is not null and gross_value_vnd = author_earnings_vnd + platform_earnings_vnd) or (settlement_status <> 'settled' and gross_value_vnd is null and author_earnings_vnd is null and platform_earnings_vnd is null)),
 check(gross_value_vnd is null or (entry_type='reversal' and gross_value_vnd<=0 and platform_earnings_vnd<=0) or (entry_type<>'reversal' and gross_value_vnd>=0 and platform_earnings_vnd>=0)),
 check(author_earnings_vnd is null or (entry_type = 'reversal' and author_earnings_vnd <= 0) or (entry_type <> 'reversal' and author_earnings_vnd >= 0))
);
create unique index author_vnd_source on public.author_vnd_ledger(source_type,source_reference_id) where entry_type='sale';
create unique index author_vnd_once on public.author_vnd_ledger(original_id,entry_type) where original_id is not null;
create index author_vnd_history on public.author_vnd_ledger(author_id,created_at desc);
alter table public.author_vnd_ledger enable row level security;
create policy read_vnd_ledger on public.author_vnd_ledger for select to authenticated using(
 exists(select 1 from public.authors a where a.id=author_id and a.user_id=auth.uid()) or private.is_admin());
grant select on public.author_vnd_ledger to authenticated;

create function private.reject_financial_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_FINANCIAL_SNAPSHOT'; end; $$;
create trigger immutable_vnd before update or delete on public.author_vnd_ledger for each row execute function private.reject_financial_mutation();
create trigger immutable_policy before update or delete on public.author_payout_policies for each row execute function private.reject_financial_mutation();

-- Old rows have no trustworthy VND snapshot, including historical high stones.
insert into public.author_vnd_ledger(author_id,user_id,source_type,source_reference_id,currency_type,stones_spent,settlement_status,description,created_at)
select l.author_id,w.user_id,case when l.type='gift' then 'author_gift' when l.chapter_entitlement_id is not null then 'chapter_unlock' else 'book_unlock' end,
 coalesce(l.chapter_entitlement_id,l.book_entitlement_id,w.reference_id),w.currency_type,l.gross_coins,'legacy_pending_settlement',l.description,l.created_at
from public.author_revenue_ledger l join public.wallet_transactions w on w.id=l.wallet_transaction_id
where l.gross_coins>0 and ((l.type='sale' and w.type='unlock_debit' and w.reference_type in ('book','chapter') and coalesce(l.chapter_entitlement_id,l.book_entitlement_id) is not null) or (l.type='gift' and w.type='gift_debit' and w.reference_type='author_gift'))
on conflict do nothing;

insert into public.author_vnd_ledger(author_id,user_id,source_type,source_reference_id,currency_type,stones_spent,entry_type,original_id,settlement_status,description)
select l.author_id,l.user_id,l.source_type,l.source_reference_id,l.currency_type,l.stones_spent,'reversal',l.id,'legacy_pending_settlement','Hoàn tiền dữ liệu cũ'
from public.author_vnd_ledger l where exists(select 1 from public.author_revenue_ledger r where r.type='refund' and coalesce(r.chapter_entitlement_id,r.book_entitlement_id)=l.source_reference_id)
on conflict do nothing;

-- Capture only qualifying server transactions. App subscription records cannot enter this ledger.
create function private.capture_author_vnd() returns trigger language plpgsql security definer set search_path='' as $$
declare w public.wallet_transactions%rowtype; p public.author_payout_policies%rowtype; o public.author_vnd_ledger%rowtype;
 s text; ref uuid; bps integer; gross bigint; earning bigint;
begin
 select * into w from public.wallet_transactions where id=new.wallet_transaction_id;
 if new.type='refund' then
  select * into o from public.author_vnd_ledger where entry_type='sale' and source_reference_id=coalesce(new.chapter_entitlement_id,new.book_entitlement_id);
  if o.id is null then return new; end if;
  perform 1 from public.authors where id=o.author_id for update;
  select * into o from public.author_vnd_ledger where original_id=o.id and entry_type='settlement';
  if o.id is null then select * into o from public.author_vnd_ledger where entry_type='sale' and source_reference_id=coalesce(new.chapter_entitlement_id,new.book_entitlement_id); end if;
  insert into public.author_vnd_ledger(author_id,user_id,source_type,source_reference_id,currency_type,stones_spent,entry_type,original_id,payout_policy_id,stone_value_vnd_snapshot,gross_value_vnd,author_share_bps_snapshot,author_earnings_vnd,platform_earnings_vnd,settlement_status,description)
  values(o.author_id,o.user_id,o.source_type,o.source_reference_id,o.currency_type,o.stones_spent,'reversal',o.id,o.payout_policy_id,o.stone_value_vnd_snapshot,-o.gross_value_vnd,o.author_share_bps_snapshot,-o.author_earnings_vnd,-o.platform_earnings_vnd,o.settlement_status,new.description) on conflict do nothing;
  return new;
 end if;
 if new.gross_coins<=0 then return new; end if;
 if new.type='gift' and w.type='gift_debit' and w.currency_type='high' and w.reference_type='author_gift' then s:='author_gift'; ref:=w.reference_id;
 elsif new.type='sale' and w.type='unlock_debit' and w.reference_type in ('book','chapter') then
  s:=case when new.chapter_entitlement_id is not null then 'chapter_unlock' else 'book_unlock' end;
  ref:=coalesce(new.chapter_entitlement_id,new.book_entitlement_id);
 else return new; end if;
 perform 1 from public.authors where id=new.author_id for update;
 select * into p from public.author_payout_policies order by created_at desc,id desc limit 1;
 bps:=case when w.currency_type='low' then p.low_creator_pool_bps else case s when 'chapter_unlock' then p.chapter_author_bps when 'book_unlock' then p.book_author_bps else p.gift_author_bps end end;
 if w.currency_type='high' and p.high_stone_value_vnd is not null then
  gross:=new.gross_coins*p.high_stone_value_vnd;
  earning:=floor(gross::numeric*bps/10000)::bigint;
 end if;
 insert into public.author_vnd_ledger(author_id,user_id,source_type,source_reference_id,currency_type,stones_spent,payout_policy_id,stone_value_vnd_snapshot,gross_value_vnd,author_share_bps_snapshot,author_earnings_vnd,platform_earnings_vnd,settlement_status,description)
 values(new.author_id,w.user_id,s,ref,w.currency_type,new.gross_coins,p.id,case when w.currency_type='high' then p.high_stone_value_vnd end,gross,bps,earning,gross-earning,case when gross is null then 'pending_settlement' else 'settled' end,new.description);
 return new;
end; $$;
create trigger capture_author_vnd after insert on public.author_revenue_ledger for each row execute function private.capture_author_vnd();

create function public.admin_set_author_payout_policy(p_high_stone_value_vnd bigint,p_chapter_bps integer,p_book_bps integer,p_gift_bps integer,p_low_pool_bps integer,p_minimum_vnd bigint,p_fee_vnd bigint)
returns public.author_payout_policies language plpgsql security definer set search_path='' as $$
declare p public.author_payout_policies%rowtype;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(610050018);
 insert into public.author_payout_policies(high_stone_value_vnd,chapter_author_bps,book_author_bps,gift_author_bps,low_creator_pool_bps,minimum_withdrawal_vnd,withdrawal_fee_vnd,created_by)
 values(p_high_stone_value_vnd,p_chapter_bps,p_book_bps,p_gift_bps,p_low_pool_bps,p_minimum_vnd,p_fee_vnd,auth.uid()) returning * into p;
 return p;
end; $$;

-- A period uses an actual pool; no fixed low-stone conversion. Rounding residue stays with platform.
create table public.author_vnd_settlement_periods (
 id uuid primary key default gen_random_uuid(), starts_at timestamptz not null, ends_at timestamptz not null,
 actual_revenue_pool_vnd bigint not null check(actual_revenue_pool_vnd>0), creator_pool_vnd bigint not null,
 payout_policy_id uuid not null references public.author_payout_policies(id),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check(ends_at>starts_at), unique(starts_at,ends_at)
);
alter table public.author_vnd_settlement_periods enable row level security;
create policy read_periods on public.author_vnd_settlement_periods for select to authenticated using(private.is_admin());
grant select on public.author_vnd_settlement_periods to authenticated;
create trigger immutable_period before update or delete on public.author_vnd_settlement_periods for each row execute function private.reject_financial_mutation();
alter table public.author_vnd_ledger add column settlement_period_id uuid references public.author_vnd_settlement_periods(id);

create function public.admin_settle_author_period(p_start timestamptz,p_end timestamptz,p_actual_pool_vnd bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.author_payout_policies%rowtype; v_entry public.author_vnd_ledger%rowtype; total numeric; pool bigint; amount bigint; period uuid;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(610050019);
 -- Same author lock used by refunds and withdrawals; deterministic order avoids deadlocks.
 perform 1 from public.authors order by id for update;
 select * into p from public.author_payout_policies order by created_at desc,id desc limit 1;
 select sum(stones_spent) into total from public.author_vnd_ledger l where l.entry_type='sale' and l.currency_type='low' and l.created_at>=p_start and l.created_at<p_end
 and not exists(select 1 from public.author_vnd_ledger x where x.original_id=l.id);
 if total is null then raise exception 'NO_PENDING_LOW_REVENUE'; end if;
 select sum(floor(p_actual_pool_vnd::numeric*l.stones_spent/total*coalesce(l.author_share_bps_snapshot,p.low_creator_pool_bps)/10000))::bigint into pool
 from public.author_vnd_ledger l where l.entry_type='sale' and l.currency_type='low' and l.created_at>=p_start and l.created_at<p_end
 and not exists(select 1 from public.author_vnd_ledger x where x.original_id=l.id);
 insert into public.author_vnd_settlement_periods(starts_at,ends_at,actual_revenue_pool_vnd,creator_pool_vnd,payout_policy_id,created_by)
 values(p_start,p_end,p_actual_pool_vnd,pool,p.id,auth.uid()) returning id into period;
 for v_entry in select * from public.author_vnd_ledger l where l.entry_type='sale' and l.currency_type='low' and l.created_at>=p_start and l.created_at<p_end
 and not exists(select 1 from public.author_vnd_ledger x where x.original_id=l.id) loop
  amount:=floor(p_actual_pool_vnd::numeric*v_entry.stones_spent/total*coalesce(v_entry.author_share_bps_snapshot,p.low_creator_pool_bps)/10000)::bigint;
  insert into public.author_vnd_ledger(author_id,user_id,source_type,source_reference_id,currency_type,stones_spent,entry_type,original_id,payout_policy_id,gross_value_vnd,author_share_bps_snapshot,author_earnings_vnd,platform_earnings_vnd,settlement_status,description,settlement_period_id)
  values(v_entry.author_id,v_entry.user_id,v_entry.source_type,v_entry.source_reference_id,'low',v_entry.stones_spent,'settlement',v_entry.id,coalesce(v_entry.payout_policy_id,p.id),floor(p_actual_pool_vnd::numeric*v_entry.stones_spent/total)::bigint,coalesce(v_entry.author_share_bps_snapshot,p.low_creator_pool_bps),amount,floor(p_actual_pool_vnd::numeric*v_entry.stones_spent/total)::bigint-amount,'settled','Đối soát kỳ '||period,period);
 end loop;
 return period;
end; $$;

alter table public.author_payouts alter column amount_coins drop not null;
alter table public.author_payouts add column requested_vnd bigint check(requested_vnd>0), add column fee_vnd bigint check(fee_vnd>=0), add column net_vnd bigint,
 add column payout_policy_id uuid references public.author_payout_policies(id),
 add constraint payout_currency_exclusive check((requested_vnd is null and amount_coins is not null) or (requested_vnd is not null and amount_coins is null)),
 add constraint payout_vnd_snapshot check(requested_vnd is null or (fee_vnd is not null and net_vnd is not null and payout_policy_id is not null and net_vnd=requested_vnd-fee_vnd and net_vnd>0));

create function private.author_vnd_balance(p_author uuid) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce((select sum(author_earnings_vnd) from public.author_vnd_ledger where author_id=p_author),0)
 -coalesce((select sum(requested_vnd) from public.author_payouts where author_id=p_author and status in ('pending','approved','paid')),0);
$$;

create function public.get_author_vnd_dashboard(p_author_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.author_payout_policies%rowtype; total bigint; paid bigint; reserved bigint;
begin
 if not private.is_admin() and not exists(select 1 from public.authors where id=p_author_id and user_id=auth.uid()) then raise exception 'AUTHOR_ACCESS_REQUIRED' using errcode='42501'; end if;
 select * into p from public.author_payout_policies order by created_at desc,id desc limit 1;
 select coalesce(sum(author_earnings_vnd),0) into total from public.author_vnd_ledger where author_id=p_author_id;
 select coalesce(sum(requested_vnd) filter(where status='paid'),0),coalesce(sum(requested_vnd) filter(where status in ('pending','approved')),0) into paid,reserved from public.author_payouts where author_id=p_author_id;
 return jsonb_build_object('policy',to_jsonb(p),'total_vnd',total,'paid_vnd',paid,'reserved_vnd',reserved,'available_payout_vnd',greatest(0,total-paid-reserved),'debt_vnd',greatest(0,paid+reserved-total),
 'pending_count',(select count(*) from public.author_vnd_ledger l where author_id=p_author_id and entry_type='sale' and settlement_status<>'settled' and not exists(select 1 from public.author_vnd_ledger x where x.original_id=l.id)),
 'pending_low_stones',(select coalesce(sum(stones_spent),0) from public.author_vnd_ledger l where author_id=p_author_id and currency_type='low' and entry_type='sale' and not exists(select 1 from public.author_vnd_ledger x where x.original_id=l.id)),
 'breakdown',(select coalesce(jsonb_object_agg(source_type,value),'{}') from (select source_type,sum(author_earnings_vnd) value from public.author_vnd_ledger where author_id=p_author_id group by source_type) b),
 'ledger',(select coalesce(jsonb_agg(to_jsonb(l) order by created_at desc),'[]') from (select * from public.author_vnd_ledger where author_id=p_author_id order by created_at desc limit 100) l));
end; $$;

create function public.author_request_payout_vnd(p_requested_vnd bigint,p_note text,p_idempotency_key text)
returns public.author_payouts language plpgsql security definer set search_path='' as $$
declare a uuid; p public.author_payout_policies%rowtype; profile public.author_payout_profiles%rowtype; r public.author_payouts%rowtype;
begin
 select id into a from public.authors where user_id=auth.uid() for update;
 if a is null then raise exception 'AUTHOR_REQUIRED' using errcode='42501'; end if;
 if p_idempotency_key is null or length(btrim(p_idempotency_key))<8 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
 select * into r from public.author_payouts where idempotency_key=btrim(p_idempotency_key);
 if found then
  if r.author_id<>a or r.requested_vnd is distinct from p_requested_vnd then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return r;
 end if;
 select * into p from public.author_payout_policies order by created_at desc,id desc limit 1;
 if p.high_stone_value_vnd is null then raise exception 'VND_RATE_NOT_CONFIGURED'; end if;
 if p_requested_vnd is null or p_requested_vnd<p.minimum_withdrawal_vnd or p_requested_vnd<=p.withdrawal_fee_vnd then raise exception 'INVALID_PAYOUT_AMOUNT'; end if;
 if p_requested_vnd>private.author_vnd_balance(a) then raise exception 'INSUFFICIENT_REQUESTABLE_EARNINGS'; end if;
 select * into profile from public.author_payout_profiles where author_id=a for share;
 if profile.destination_label is null or length(btrim(profile.destination_label))<3 then raise exception 'PAYOUT_DESTINATION_REQUIRED'; end if;
 insert into public.author_payouts(author_id,amount_coins,requested_vnd,fee_vnd,net_vnd,payout_policy_id,note,idempotency_key,requested_by,request_snapshot)
 values(a,null,p_requested_vnd,p.withdrawal_fee_vnd,p_requested_vnd-p.withdrawal_fee_vnd,p.id,p_note,btrim(p_idempotency_key),auth.uid(),
 jsonb_build_object('payout_method',profile.payout_method,'destination_label',profile.destination_label,'kyc_status',profile.kyc_status,'tax_status',profile.tax_status)) returning * into r;
 return r;
end; $$;
-- Prevent old clients/admin tools from withdrawing unpriced stones.
create or replace function public.author_request_payout(p_amount_coins bigint,p_note text,p_idempotency_key text) returns public.author_payouts language plpgsql security definer set search_path='' as $$
begin raise exception 'USE_VND_PAYOUT'; end; $$;
create or replace function public.admin_record_paid_author_payout(p_author_id uuid,p_amount_coins bigint,p_external_reference text,p_note text,p_idempotency_key text) returns public.author_payouts language plpgsql security definer set search_path='' as $$
begin raise exception 'USE_VND_PAYOUT'; end; $$;

create function private.guard_vnd_payout() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.requested_vnd is distinct from old.requested_vnd or new.fee_vnd is distinct from old.fee_vnd or new.net_vnd is distinct from old.net_vnd or new.payout_policy_id is distinct from old.payout_policy_id or new.request_snapshot is distinct from old.request_snapshot or new.author_id<>old.author_id or new.amount_coins is distinct from old.amount_coins or new.idempotency_key is distinct from old.idempotency_key or new.created_at<>old.created_at then raise exception 'IMMUTABLE_PAYOUT_SNAPSHOT'; end if;
 perform 1 from public.authors where id=new.author_id for update;
 if new.status='paid' and old.status<>'paid' then
  if new.requested_vnd is null then raise exception 'LEGACY_PAYOUT_REQUIRES_SETTLEMENT'; end if;
  if private.author_vnd_balance(new.author_id)<0 then raise exception 'INSUFFICIENT_AUTHOR_EARNINGS_AT_SETTLEMENT'; end if;
 end if;
 return new;
end; $$;
create trigger guard_vnd_payout before update on public.author_payouts for each row execute function private.guard_vnd_payout();

create or replace function public.admin_mark_payout_paid(p_payout_id uuid,p_external_reference text,p_note text)
returns public.author_payouts language plpgsql security definer set search_path='' as $$
declare r public.author_payouts%rowtype;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_external_reference is null or length(btrim(p_external_reference))<3 then raise exception 'EXTERNAL_REFERENCE_REQUIRED'; end if;
 select * into r from public.author_payouts where id=p_payout_id for update;
 if not found then raise exception 'PAYOUT_REQUEST_NOT_FOUND'; end if;
 if r.status='paid' then return r; end if;
 if r.status<>'approved' then raise exception 'PAYOUT_NOT_APPROVED'; end if;
 update public.author_payouts set status='paid',external_reference=btrim(p_external_reference),processed_at=now(),processed_by=auth.uid(),note=coalesce(nullif(btrim(p_note),''),note) where id=r.id returning * into r;
 return r;
end; $$;

revoke all on function private.capture_author_vnd(),private.author_vnd_balance(uuid),private.guard_vnd_payout(),private.reject_financial_mutation() from public,anon,authenticated;
revoke all on function public.admin_set_author_payout_policy(bigint,integer,integer,integer,integer,bigint,bigint),public.admin_settle_author_period(timestamptz,timestamptz,bigint),public.get_author_vnd_dashboard(uuid),public.author_request_payout_vnd(bigint,text,text) from public,anon;
grant execute on function public.admin_set_author_payout_policy(bigint,integer,integer,integer,integer,bigint,bigint),public.admin_settle_author_period(timestamptz,timestamptz,bigint),public.get_author_vnd_dashboard(uuid),public.author_request_payout_vnd(bigint,text,text) to authenticated;
alter function public.admin_refund_entitlement(text,uuid,text,text) security definer;
revoke insert,update,delete on public.author_revenue_ledger from authenticated,anon;
revoke insert,update,delete on public.author_vnd_ledger,public.author_payout_policies,public.author_vnd_settlement_periods,public.author_payouts from authenticated,anon;
create or replace function private.notify_author_payout_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_title text;
  v_body text;
begin
  if tg_op <> 'UPDATE' or new.status = old.status then return new; end if;

  select a.user_id into v_user_id
  from public.authors a
  where a.id = new.author_id;

  if new.status::text = 'approved' then
    v_title := 'Yêu cầu rút đã được duyệt';
    v_body := coalesce(new.requested_vnd::text || 'đ', 'Khoản dữ liệu cũ') || ' đang chờ đối soát thanh toán.';
  elsif new.status::text = 'paid' then
    v_title := 'Doanh thu đã được thanh toán';
    v_body := coalesce(new.requested_vnd::text || 'đ', 'Khoản dữ liệu cũ') || ' đã được ghi nhận thanh toán'
      || case when new.external_reference is not null then ' · Mã ' || new.external_reference else '' end || '.';
  elsif new.status::text = 'cancelled' then
    v_title := 'Yêu cầu rút đã bị hủy';
    v_body := coalesce(new.requested_vnd::text || 'đ', 'Khoản dữ liệu cũ') || ' đã được giải phóng khỏi yêu cầu rút.';
  else
    return new;
  end if;

  perform private.enqueue_notification(
    v_user_id,
    'payout',
    'payout_' || new.status::text,
    v_title,
    v_body,
    '/author/payout',
    'payout:' || new.id::text || ':' || new.status::text,
    jsonb_build_object(
      'payout_id', new.id,
      'requested_vnd', new.requested_vnd, 'net_vnd', new.net_vnd,
      'status', new.status::text,
      'external_reference', new.external_reference
    )
  );

  return new;
exception when others then
  return new;
end;
$$;


commit;
