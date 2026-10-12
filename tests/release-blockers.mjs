import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto, sign, generateKeyPairSync } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const key = ec.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../supabase/functions/_shared/admobSsv.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports, crypto: webcrypto, TextEncoder, Uint8Array, Date, Error, atob, AbortSignal,
  fetch: async url => { assert.equal(url, 'https://www.gstatic.com/admob/reward/verifier-keys.json'); return Response.json({ keys: [{ keyId: 7, base64: key }] }); } });
const id = '10000000-0000-4000-8000-000000000001';
const signed = query => new URL(`https://fixture.test/ssv?${query}&signature=${sign('sha256', Buffer.from(query), ec.privateKey).toString('base64url')}&key_id=7`);
const query = `ad_unit=test-unit&custom_data=${id}&reward_amount=1&reward_item=reward&timestamp=${Date.now()}&transaction_id=tx-fixture&user_id=${id}`;
const verify = url => module.exports.verifyAdmobCallback(url, ['test-unit'], 'reward', '1');
assert.equal((await verify(signed(query))).id, id);
for (const url of [new URL(signed(query).href.replace('test-unit','tampered')), signed(query.replace('user_id='+id,'user_id=other')),
  signed(query+'&reward_amount=1'), signed(query.replace('reward_amount=1','reward_amount=10')), signed(query.replace('test-unit','wrong-unit')),
  new URL(signed(query).href+'&unsigned_extra=1')]) await assert.rejects(verify(url));
for (const bytes of [new Uint8Array([0x30,0]),new Uint8Array([0x30,2,2,0])]) assert.throws(() => module.exports.derToRaw(bytes));
console.log('PASS: actual ECDSA/DER SSV signature, exact query, tampering, duplicate params, reward/unit/session binding, unsigned suffix');

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('role',current_setting('request.jwt.claim.role',true)) $$;
create function private.is_admin() returns boolean language sql stable as $$ select auth.uid()='10000000-0000-4000-8000-000000000003'::uuid $$;
create table public.profiles(id uuid primary key references auth.users on delete cascade);
create table public.wallet_accounts(user_id uuid primary key references public.profiles on delete cascade,balance bigint default 0);
create table public.wallet_transactions(id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles on delete cascade);
create table public.daily_cultivation_claims(user_id uuid,quest_date date,quest_key text,reward_coins integer,unique(user_id,quest_date,quest_key));
create function private.credit_daily_cultivation_reward(p_user_id uuid,p_date date,p_key text,p_reward integer) returns void language sql as $$ update public.wallet_accounts set balance=balance+p_reward where user_id=p_user_id $$;
create function public.get_daily_cultivation() returns jsonb language sql security definer as $$ select jsonb_build_object('balance',balance) from public.wallet_accounts where user_id=auth.uid() $$;
grant usage on schema public,auth,private to anon,authenticated,service_role;`);
for (const file of ['202610120001_account_deletion_requests.sql','202610120002_rewarded_ssv.sql','202610120003_deletion_workflow.sql'])
  await db.exec(readFileSync(new URL('../supabase/migrations/'+file, import.meta.url),'utf8'));
const bob = '10000000-0000-4000-8000-000000000002', admin = '10000000-0000-4000-8000-000000000003';
await db.exec(`insert into auth.users values('${id}'),('${bob}'),('${admin}'); insert into profiles values('${id}'),('${bob}'); insert into wallet_accounts(user_id) values('${id}');`);
async function identity(user,role='authenticated') {
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[user,role]); await db.exec('set role '+role);
}
const row = async sql => (await db.query(sql)).rows[0];
await identity(id);
const session = (await row('select begin_rewarded_ad_session() as data')).data;
assert.equal((await row('select begin_rewarded_ad_session() as data')).data.id,session.id);
await db.query('select claim_rewarded_ad_bonus()');
await assert.rejects(db.query(`select credit_verified_rewarded_ad('${session.id}','tx',${Date.now()})`));
await identity(bob); assert.equal((await db.query('select * from rewarded_ad_sessions')).rows.length,0);
const bobSession=(await row('select begin_rewarded_ad_session() as data')).data.id;
await identity(id,'service_role');
const timestamp = Date.now();
await assert.rejects(db.query(`select credit_verified_rewarded_ad('${session.id}','tx',1)`));
await db.query(`select credit_verified_rewarded_ad('${session.id}','tx',${timestamp})`);
await db.query(`select credit_verified_rewarded_ad('${session.id}','tx',${timestamp})`);
await assert.rejects(db.query(`select credit_verified_rewarded_ad('${bobSession}','tx',${timestamp})`),'Transaction reuse across sessions must roll back');
await assert.rejects(db.query(`select credit_verified_rewarded_ad('${session.id}','different',${timestamp})`));
await db.exec('reset role'); assert.equal((await row(`select balance from wallet_accounts where user_id='${id}'`)).balance,10);
await assert.rejects(db.query(`delete from auth.users where id='${id}'`));
assert.equal((await row(`select balance from wallet_accounts where user_id='${id}'`)).balance,10);
await identity(id); const request = (await row('select request_account_deletion() as data')).data;
await assert.rejects(db.query('select admin_deletion_queue()'));
await assert.rejects(db.query(`select admin_deletion_action('${request.id}','claim')`));
await identity(bob); const bobRequest = (await row('select request_account_deletion() as data')).data;
assert.equal((await row('select get_account_deletion_status() as data')).data.id,bobRequest.id);
await identity(admin); assert.equal((await row('select admin_deletion_queue() as data')).data.length,2);
const lease = (await row(`select admin_deletion_action('${bobRequest.id}','claim') as data`)).data.token;
await assert.rejects(db.query(`select admin_deletion_action('${bobRequest.id}','claim')`));
await assert.rejects(db.query(`select admin_deletion_action('${bobRequest.id}','record',gen_random_uuid(),'storage','fixture evidence')`));
await assert.rejects(db.query(`select admin_deletion_action('${bobRequest.id}','complete','${lease}')`));
for (const step of ['retention_review','wallet_and_payout_review','ugc_and_rights','personal_data','storage','devices_and_providers','auth_sessions','completion_notice'])
  await db.query(`select admin_deletion_action('${bobRequest.id}','record','${lease}','${step}','staging-fixture evidence only')`);
await assert.rejects(db.query(`select admin_deletion_action('${bobRequest.id}','complete','${lease}')`),'Policy missing');
await db.exec('reset role'); await db.query(`update account_deletion_requests set policy_version='fixture-approved' where id='${bobRequest.id}'`);
await identity(admin); await assert.rejects(db.query(`select admin_deletion_action('${bobRequest.id}','complete','${lease}')`),'Auth still exists');
await db.exec('reset role'); await db.query(`delete from auth.users where id='${bob}'`);
await identity(admin); assert.equal((await row(`select admin_deletion_action('${bobRequest.id}','complete','${lease}') as data`)).data.status,'completed');
assert.equal((await row(`select admin_deletion_action('${bobRequest.id}','claim') as data`)).data.status,'completed');
console.log('PASS: local staging migrations, direct reward denial, SSV duplicate/replay/expiry/RLS, financial cascade prevention, deletion admin ACL/lease/evidence/policy/auth completion guards');
await db.exec('reset role; create schema storage; create table storage.objects(bucket_id text,name text); grant usage on schema storage to authenticated; grant insert on storage.objects to authenticated;');
for (const table of ['authors','books','chapters','comments','book_reviews']) await db.exec(`create table public.${table}(id uuid default gen_random_uuid(),body text); grant insert on ${table} to authenticated;`);
await db.exec(readFileSync(new URL('../supabase/migrations/202610120004_ugc_policy_acceptance.sql',import.meta.url),'utf8'));
await identity(id); await db.query("insert into comments(body) values('Draft has no enforceable approved terms')");
await assert.rejects(db.query("select accept_ugc_policy('draft')"));
await db.exec('reset role'); await db.query("insert into ugc_policy_versions(version,terms_text,approved_by_owner_at,active) values('fixture-1',$1,now(),true)",['Fixture legal text '.repeat(20)]);
await identity(id); await assert.rejects(db.query("insert into comments(body) values('unaccepted')"));
for (const table of ['authors','books','chapters','book_reviews']) await assert.rejects(db.query(`insert into ${table}(body) values('unaccepted')`));
await assert.rejects(db.query("insert into storage.objects values('book-covers','unaccepted-cover')"));
await db.query("select accept_ugc_policy('fixture-1')"); await db.query("select accept_ugc_policy('fixture-1')");
assert.equal((await db.query('select * from ugc_policy_acceptances')).rows.length,1);
await db.query("insert into comments(body) values('accepted')");
await db.query("insert into storage.objects values('book-covers','accepted-cover')");
await assert.rejects(db.query(`insert into ugc_policy_acceptances(user_id,version) values('${admin}','fixture-1')`));
await identity(admin); await assert.rejects(db.query("insert into comments(body) values('other account')"));
await db.exec('reset role'); await db.query("update ugc_policy_versions set active=false");
await assert.rejects(db.query("update ugc_policy_versions set terms_text='silently replaced approved legal text'"));
await db.query("insert into ugc_policy_versions(version,terms_text,approved_by_owner_at,active) values('fixture-2',$1,now(),true)",['Revised fixture legal text '.repeat(20)]);
await identity(id); await assert.rejects(db.query("insert into comments(body) values('old version')"));
await assert.rejects(db.query("select accept_ugc_policy('fixture-1')"));
await db.close();
console.log('PASS: UGC approved version only, DRAFT inactive, acceptance unique/own, forged writes and outdated/unaccepted posting denied');
