import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Isolated DB: no user accounts, real coins or external AdMob network.
const db = new PGlite();
await db.exec([
  "create role authenticated; create role anon; create role service_role;",
  "create schema auth; create schema private;",
  "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
  "create table public.profiles(id uuid primary key);",
  "create table public.daily_cultivation_claims(user_id uuid not null,quest_date date not null,quest_key text not null,reward_coins integer not null,claimed_at timestamptz default now(),primary key(user_id,quest_date,quest_key));",
  "create table public.daily_cultivation_days(user_id uuid not null,quest_date date not null,streak_count int,checkin_claimed_at timestamptz);",
  "create table public.wallet_accounts(user_id uuid primary key,balance_coins bigint default 0);",
  "create function private.daily_cultivation_metrics(uuid,date) returns table(read_seconds integer,chapters_completed integer,reviews_created integer) language sql as $$select 0,0,0$$;",
  "create function private.credit_daily_cultivation_reward(uuid,date,text,integer) returns bigint language plpgsql security definer set search_path='' as $$ declare balance bigint; begin insert into public.wallet_accounts(user_id,balance_coins) values($1,$4) on conflict(user_id) do update set balance_coins=public.wallet_accounts.balance_coins+$4 returning balance_coins into balance; return balance; end; $$;",
  "grant usage on schema public,auth to authenticated,service_role;",
  "grant select on public.wallet_accounts to authenticated,service_role;",
  "grant select on public.daily_cultivation_claims to authenticated,service_role;",
].join('\n'));
const migration = readFileSync(new URL('../supabase/migrations/202610160002_admob_verified_rewards.sql', import.meta.url), 'utf8');
await db.exec(migration);
const userId = '10000000-0000-4000-8000-000000000001';
await db.exec("insert into public.profiles(id) values('"+userId+"')");
async function auth(role) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[userId,role]);
  await db.exec('set role '+role);
}
async function row(query) { return (await db.query(query)).rows[0]; }
await auth('authenticated');
await assert.rejects(db.exec('select public.claim_rewarded_ad_bonus()'));
await assert.rejects(db.exec("select public.confirm_verified_admob_reward(gen_random_uuid(),'"+userId+"','abcdef0123456789','2277387891',5,1)"));
const ticket=(await row('select public.begin_rewarded_ad_session() as id')).id;
assert.match(ticket,/^[a-f0-9-]{36}$/);
assert.equal((await row("select (public.get_daily_cultivation()->'quests'->4->>'reward')::int as points")).points,5);
assert.equal((await row('select public.begin_rewarded_ad_session() as id')).id,ticket);
await auth('service_role');
// Modern PostgREST exposes the complete JWT in request.jwt.claims.
await db.query("select set_config('request.jwt.claim.role','',false),set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
const now=Date.now();
const args=["'"+ticket+"'","'"+userId+"'","'abcdef0123456789'","'2277387891'",'5',String(now)].join(',');
await assert.rejects(db.exec('select public.confirm_verified_admob_reward('+args.replace(',5,', ',null,')+')'));
assert.equal((await row('select public.confirm_verified_admob_reward('+args+') as ok')).ok,true);
assert.equal((await row('select public.confirm_verified_admob_reward('+args+') as ok')).ok,true);
assert.equal(Number((await row("select balance_coins as b from public.wallet_accounts where user_id='"+userId+"'")).b),5);
assert.equal(Number((await row("select count(*) as n from public.daily_cultivation_claims where user_id='"+userId+"' and quest_key='rewarded_ad'")).n),1);
const badAmount=["'"+ticket+"'","'"+userId+"'","'abcdef9876543210'","'2277387891'",'10',String(now)].join(',');
await assert.rejects(db.exec('select public.confirm_verified_admob_reward('+badAmount+')'));
await auth('authenticated');
await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated' })]);
await assert.rejects(db.exec('select public.begin_rewarded_ad_session()'));
await db.close();
console.log('PASS: five-stone credit only via service-role verified callback; direct claims denied; retries idempotent');
