-- Rewarded AdMob videos are 5 LOW stones, only after signed Google SSV verification.
-- Safe forward migration: no legacy client can mint stones by calling the old RPC.
begin;
create table if not exists public.admob_reward_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  verified_transaction_id text unique,
  verified_at timestamptz
);
create index if not exists admob_reward_sessions_user_created
on public.admob_reward_sessions(user_id, created_at desc);
alter table public.admob_reward_sessions enable row level security;
revoke all on table public.admob_reward_sessions from public,anon,authenticated;

-- One-use server ticket tied to the authenticated CHƯƠNG user account.
create or replace function public.begin_rewarded_ad_session()
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); today date := (timezone('UTC',now()))::date;
        ticket uuid;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if exists(select 1 from public.daily_cultivation_claims
    where user_id=uid and quest_date=today and quest_key='rewarded_ad') then
    raise exception 'REWARD_ALREADY_CLAIMED';
  end if;
  select s.id into ticket
  from public.admob_reward_sessions s
  where s.user_id=uid and s.expires_at>now() and s.verified_at is null
  order by s.created_at desc limit 1;
  if ticket is not null then return ticket; end if;
  -- Prevent excessive unfinished sessions; clean up only expired tickets separately.
  if (select count(*) from public.admob_reward_sessions s
      where s.user_id=uid and s.created_at >= now()-interval '1 day') >= 12 then
    raise exception 'TOO_MANY_AD_SESSIONS';
  end if;
  insert into public.admob_reward_sessions(user_id) values(uid) returning id into ticket;
  return ticket;
end;
$$;
revoke execute on function public.begin_rewarded_ad_session() from public,anon;
grant execute on function public.begin_rewarded_ad_session() to authenticated;

-- Called ONLY after the Edge Function verifies the exact Google ECDSA signature.
create or replace function public.confirm_verified_admob_reward(
  p_ticket uuid,p_user_id uuid,p_transaction_id text,p_ad_unit text,
  p_reward_amount integer,p_timestamp_ms bigint
) returns boolean language plpgsql security definer set search_path='' as $$
declare ticket public.admob_reward_sessions%rowtype;
        event_at timestamptz;
        event_date date;
        inserted boolean := false;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',
              current_setting('request.jwt.claim.role',true)) is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if p_reward_amount is distinct from 5
    or p_ad_unit is null or p_ad_unit not in('2277387891','ca-app-pub-2610920886028786/2277387891')
    or p_transaction_id is null or p_transaction_id !~ '^[A-Fa-f0-9]{10,100}$'
    or p_timestamp_ms is null or p_timestamp_ms<=0 then
    raise exception 'INVALID_ADMOB_REWARD';
  end if;
  event_at := to_timestamp(p_timestamp_ms::numeric/1000);
  if event_at > now()+interval '5 minutes' then raise exception 'FUTURE_AD_EVENT'; end if;
  select * into ticket from public.admob_reward_sessions
     where id=p_ticket and user_id=p_user_id for update;
  if not found then raise exception 'UNKNOWN_REWARD_SESSION'; end if;
  if ticket.verified_transaction_id is not null then
    return ticket.verified_transaction_id=p_transaction_id;
  end if;
  if event_at<ticket.created_at-interval '5 minutes'
    or event_at>ticket.expires_at then
    raise exception 'EXPIRED_AD_EVENT';
  end if;
  if exists(select 1 from public.admob_reward_sessions
    where verified_transaction_id=p_transaction_id) then
    raise exception 'REPLAYED_AD_TRANSACTION';
  end if;
  event_date := (timezone('UTC',event_at))::date;
  insert into public.daily_cultivation_claims(user_id,quest_date,quest_key,reward_coins)
  values (p_user_id,event_date,'rewarded_ad',5)
  on conflict do nothing returning true into inserted;
  -- We don't mint coins for duplicates; record the verified callback only.
  if coalesce(inserted,false) then
    perform private.credit_daily_cultivation_reward(p_user_id,event_date,'rewarded_ad',5);
  end if;
  update public.admob_reward_sessions
    set verified_transaction_id=p_transaction_id,verified_at=now()
    where id=p_ticket;
  return coalesce(inserted,false);
end;
$$;
revoke execute on function public.confirm_verified_admob_reward(uuid,uuid,text,text,integer,bigint)
  from public,anon,authenticated;
grant execute on function public.confirm_verified_admob_reward(uuid,uuid,text,text,integer,bigint)
  to service_role;

-- Legacy direct reward-claim endpoint is removed as a source of unverified money.
create or replace function public.claim_rewarded_ad_bonus()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  raise exception 'REWARDED_AD_SSV_REQUIRED' using errcode='42501';
end;
$$;
revoke execute on function public.claim_rewarded_ad_bonus() from public,anon,authenticated;

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
      jsonb_build_object('key','checkin','title','Điểm danh hôm nay','description','Mở CHƯƠNG và nhận Linh Thạch mỗi ngày.','progress',case when 'checkin'=any(v_claimed) then 1 else 0 end,'target',1,'reward',5,'eligible',true,'claimed','checkin'=any(v_claimed)),
      jsonb_build_object('key','read_10m','title','Đọc 10 phút','description','Thời gian đọc thật được hệ thống ghi nhận.','progress',least(v_read,600),'target',600,'reward',5,'eligible',v_read>=600,'claimed','read_10m'=any(v_claimed)),
      jsonb_build_object('key','complete_3','title','Hoàn thành 3 chương','description','Đọc đến ít nhất 90% của 3 chương khác nhau.','progress',least(v_completed,3),'target',3,'reward',5,'eligible',v_completed>=3,'claimed','complete_3'=any(v_claimed)),
      jsonb_build_object('key','review_1','title','Đánh giá 1 truyện','description','Tạo một đánh giá mới được duyệt trong hôm nay.','progress',least(v_reviews,1),'target',1,'reward',3,'eligible',v_reviews>=1,'claimed','review_1'=any(v_claimed)),
      jsonb_build_object('key','rewarded_ad','title','Xem quảng cáo nhận thưởng','description','Xem hết một quảng cáo thưởng để nhận Linh Thạch. Tối đa 1 lần mỗi ngày.','progress',case when 'rewarded_ad'=any(v_claimed) then 1 else 0 end,'target',1,'reward',5,'eligible',true,'claimed','rewarded_ad'=any(v_claimed))
    )
  );
end;
$$;
commit;
