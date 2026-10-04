-- CHUONG Phase 4L1: daily cultivation quests + streak rewards
begin;

create table if not exists public.daily_cultivation_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_date date not null,
  streak_count integer not null default 0 check (streak_count >= 0),
  checkin_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, quest_date)
);

create table if not exists public.daily_cultivation_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_date date not null,
  quest_key text not null check (quest_key in ('checkin','read_10m','complete_3','review_1')),
  reward_coins integer not null check (reward_coins > 0),
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_date, quest_key)
);

alter table public.daily_cultivation_days enable row level security;
alter table public.daily_cultivation_claims enable row level security;

drop policy if exists "users read own cultivation days" on public.daily_cultivation_days;
create policy "users read own cultivation days"
on public.daily_cultivation_days for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users read own cultivation claims" on public.daily_cultivation_claims;
create policy "users read own cultivation claims"
on public.daily_cultivation_claims for select to authenticated
using ((select auth.uid()) = user_id);

grant select on public.daily_cultivation_days to authenticated;
grant select on public.daily_cultivation_claims to authenticated;

create or replace function private.daily_cultivation_metrics(p_user_id uuid, p_date date)
returns table (read_seconds integer, chapters_completed integer, reviews_created integer)
language sql
security definer
set search_path = ''
stable
as $$
  with actor as (
    select encode(extensions.digest('chuong:actor:v1:u:' || p_user_id::text, 'sha256'), 'hex') as actor_hash
  )
  select
    coalesce((select least(86400, sum(s.active_seconds))::integer from public.reader_engagement_sessions s, actor a where s.actor_hash=a.actor_hash and s.started_date=p_date),0),
    coalesce((select count(distinct s.chapter_id)::integer from public.reader_engagement_sessions s, actor a where s.actor_hash=a.actor_hash and s.completed=true and (timezone('UTC',s.completed_at))::date=p_date),0),
    coalesce((select count(*)::integer from public.book_reviews r where r.user_id=p_user_id and (timezone('UTC',r.created_at))::date=p_date and r.moderation_state='approved'),0);
$$;

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
    case p_quest_key when 'checkin' then 'Điểm danh tu luyện hằng ngày' when 'read_10m' then 'Nhiệm vụ đọc 10 phút' when 'complete_3' then 'Nhiệm vụ hoàn thành 3 chương' else 'Nhiệm vụ đánh giá truyện' end,
    jsonb_build_object('quest_date',p_date,'quest_key',p_quest_key)
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  return v_balance;
end;
$$;

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
  select m.read_seconds,m.chapters_completed,m.reviews_created into v_read,v_completed,v_reviews from private.daily_cultivation_metrics(v_uid,v_date) m;
  select coalesce(max(d.streak_count),0) into v_streak from public.daily_cultivation_days d
   where d.user_id=v_uid and d.quest_date in(v_date,v_date-1) and d.checkin_claimed_at is not null;
  select coalesce(array_agg(c.quest_key order by c.quest_key),array[]::text[]) into v_claimed
   from public.daily_cultivation_claims c where c.user_id=v_uid and c.quest_date=v_date;
  select coalesce(w.balance_coins,0) into v_balance from public.wallet_accounts w where w.user_id=v_uid;

  return jsonb_build_object(
    'date',v_date,'streak',v_streak,'balance',v_balance,
    'earnedToday',coalesce((select sum(c.reward_coins) from public.daily_cultivation_claims c where c.user_id=v_uid and c.quest_date=v_date),0),
    'quests',jsonb_build_array(
      jsonb_build_object('key','checkin','title','Điểm danh hôm nay','description','Mở CHƯƠNG và nhận Linh Thạch mỗi ngày.','progress',case when 'checkin'=any(v_claimed) then 1 else 0 end,'target',1,'reward',5,'eligible',true,'claimed','checkin'=any(v_claimed)),
      jsonb_build_object('key','read_10m','title','Đọc 10 phút','description','Thời gian đọc thật được hệ thống ghi nhận.','progress',least(v_read,600),'target',600,'reward',5,'eligible',v_read>=600,'claimed','read_10m'=any(v_claimed)),
      jsonb_build_object('key','complete_3','title','Hoàn thành 3 chương','description','Đọc đến ít nhất 90% của 3 chương khác nhau.','progress',least(v_completed,3),'target',3,'reward',5,'eligible',v_completed>=3,'claimed','complete_3'=any(v_claimed)),
      jsonb_build_object('key','review_1','title','Đánh giá 1 truyện','description','Tạo một đánh giá mới được duyệt trong hôm nay.','progress',least(v_reviews,1),'target',1,'reward',3,'eligible',v_reviews>=1,'claimed','review_1'=any(v_claimed))
    )
  );
end;
$$;

create or replace function public.claim_daily_cultivation(p_quest_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_date date := (timezone('UTC',now()))::date;
  v_read integer := 0; v_completed integer := 0; v_reviews integer := 0;
  v_reward integer; v_eligible boolean := false; v_inserted boolean := false;
  v_prev_streak integer := 0; v_streak integer := 0;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_quest_key not in('checkin','read_10m','complete_3','review_1') then raise exception 'Unknown daily quest'; end if;
  if exists(select 1 from public.daily_cultivation_claims where user_id=v_uid and quest_date=v_date and quest_key=p_quest_key) then return public.get_daily_cultivation(); end if;

  select m.read_seconds,m.chapters_completed,m.reviews_created into v_read,v_completed,v_reviews from private.daily_cultivation_metrics(v_uid,v_date) m;
  v_reward := case p_quest_key when 'checkin' then 5 when 'read_10m' then 5 when 'complete_3' then 5 when 'review_1' then 3 end;
  v_eligible := case p_quest_key when 'checkin' then true when 'read_10m' then v_read>=600 when 'complete_3' then v_completed>=3 when 'review_1' then v_reviews>=1 else false end;
  if not v_eligible then raise exception 'QUEST_NOT_COMPLETE' using errcode='P0001'; end if;

  insert into public.daily_cultivation_claims(user_id,quest_date,quest_key,reward_coins)
  values(v_uid,v_date,p_quest_key,v_reward) on conflict do nothing returning true into v_inserted;
  if not coalesce(v_inserted,false) then return public.get_daily_cultivation(); end if;

  if p_quest_key='checkin' then
    select coalesce(streak_count,0) into v_prev_streak from public.daily_cultivation_days
      where user_id=v_uid and quest_date=v_date-1 and checkin_claimed_at is not null;
    v_streak := coalesce(v_prev_streak,0)+1;
    insert into public.daily_cultivation_days(user_id,quest_date,streak_count,checkin_claimed_at,updated_at)
    values(v_uid,v_date,v_streak,now(),now())
    on conflict(user_id,quest_date) do update set
      streak_count=excluded.streak_count,
      checkin_claimed_at=coalesce(public.daily_cultivation_days.checkin_claimed_at,excluded.checkin_claimed_at),
      updated_at=now();
  end if;

  perform private.credit_daily_cultivation_reward(v_uid,v_date,p_quest_key,v_reward);
  return public.get_daily_cultivation();
end;
$$;

revoke execute on function public.get_daily_cultivation() from public,anon;
revoke execute on function public.claim_daily_cultivation(text) from public,anon;
grant execute on function public.get_daily_cultivation() to authenticated;
grant execute on function public.claim_daily_cultivation(text) to authenticated;

commit;