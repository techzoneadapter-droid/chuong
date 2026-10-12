begin;
create table public.rewarded_ad_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  transaction_id text unique,
  verified_at timestamptz,
  credited boolean not null default false
);
alter table public.rewarded_ad_sessions enable row level security;
revoke all on public.rewarded_ad_sessions from public,anon,authenticated;
grant select on public.rewarded_ad_sessions to authenticated;
grant all on public.rewarded_ad_sessions to service_role;
create policy "own ad sessions" on public.rewarded_ad_sessions for select to authenticated using(user_id=(select auth.uid()));

create function public.begin_rewarded_ad_session() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_session public.rewarded_ad_sessions;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,42));
  if exists(select 1 from public.daily_cultivation_claims where user_id=v_uid and quest_date=(timezone('UTC',now()))::date and quest_key='rewarded_ad') then
    raise exception 'Reward already claimed';
  end if;
  select * into v_session from public.rewarded_ad_sessions where user_id=v_uid and expires_at>now() and verified_at is null order by created_at desc limit 1;
  if v_session.id is null then insert into public.rewarded_ad_sessions(user_id) values(v_uid) returning * into v_session; end if;
  return jsonb_build_object('id',v_session.id,'expiresAt',v_session.expires_at);
end $$;
revoke all on function public.begin_rewarded_ad_session() from public,anon;
grant execute on function public.begin_rewarded_ad_session() to authenticated;

-- Only the signature-verifying Edge Function may call this authority.
create function public.credit_verified_rewarded_ad(p_session_id uuid,p_transaction_id text,p_timestamp bigint) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_session public.rewarded_ad_sessions; v_date date; v_inserted boolean := false;
begin
  if p_transaction_id is null or length(p_transaction_id) not between 1 and 256 then raise exception 'Invalid transaction'; end if;
  select * into v_session from public.rewarded_ad_sessions where id=p_session_id for update;
  if v_session.id is null then raise exception 'Unknown session'; end if;
  if v_session.transaction_id is not null then
    if v_session.transaction_id<>p_transaction_id then raise exception 'Session replay'; end if;
    return v_session.credited;
  end if;
  if to_timestamp(p_timestamp/1000.0) < v_session.created_at - interval '1 minute'
     or to_timestamp(p_timestamp/1000.0) > v_session.expires_at
     or to_timestamp(p_timestamp/1000.0)>now()+interval '1 minute'
     or now()>v_session.expires_at+interval '24 hours' then raise exception 'Expired callback'; end if;
  v_date := (timezone('UTC',to_timestamp(p_timestamp/1000.0)))::date;
  insert into public.daily_cultivation_claims(user_id,quest_date,quest_key,reward_coins)
    values(v_session.user_id,v_date,'rewarded_ad',10) on conflict do nothing returning true into v_inserted;
  if coalesce(v_inserted,false) then perform private.credit_daily_cultivation_reward(v_session.user_id,v_date,'rewarded_ad',10); end if;
  update public.rewarded_ad_sessions set transaction_id=p_transaction_id, verified_at=now(),credited=coalesce(v_inserted,false) where id=p_session_id;
  return coalesce(v_inserted,false);
end $$;
revoke all on function public.credit_verified_rewarded_ad(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.credit_verified_rewarded_ad(uuid,text,bigint) to service_role;

-- Legacy clients may refresh state, but can no longer mint currency.
create or replace function public.claim_rewarded_ad_bonus() returns jsonb
language sql security definer set search_path='' as $$ select public.get_daily_cultivation() $$;
revoke all on function public.claim_rewarded_ad_bonus() from public,anon;
grant execute on function public.claim_rewarded_ad_bonus() to authenticated;
commit;
