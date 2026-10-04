-- CHUONG Phase 4L2: one rewarded-ad bonus per day
begin;

alter table public.daily_cultivation_claims
  drop constraint if exists daily_cultivation_claims_quest_key_check;
alter table public.daily_cultivation_claims
  add constraint daily_cultivation_claims_quest_key_check
  check (quest_key in ('checkin','read_10m','complete_3','review_1','rewarded_ad'));

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
      jsonb_build_object('key','rewarded_ad','title','Xem quảng cáo nhận thưởng','description','Xem hết một quảng cáo thưởng để nhận Linh Thạch. Tối đa 1 lần mỗi ngày.','progress',case when 'rewarded_ad'=any(v_claimed) then 1 else 0 end,'target',1,'reward',10,'eligible',true,'claimed','rewarded_ad'=any(v_claimed))
    )
  );
end;
$$;

create or replace function public.claim_rewarded_ad_bonus()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_date date := (timezone('UTC',now()))::date;
  v_inserted boolean := false;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;

  insert into public.daily_cultivation_claims(user_id,quest_date,quest_key,reward_coins)
  values(v_uid,v_date,'rewarded_ad',10)
  on conflict do nothing
  returning true into v_inserted;

  if coalesce(v_inserted,false) then
    perform private.credit_daily_cultivation_reward(v_uid,v_date,'rewarded_ad',10);
  end if;

  return public.get_daily_cultivation();
end;
$$;

revoke execute on function public.claim_rewarded_ad_bonus() from public,anon;
grant execute on function public.claim_rewarded_ad_bonus() to authenticated;

commit;