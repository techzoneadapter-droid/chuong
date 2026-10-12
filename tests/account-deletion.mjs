import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to anon,authenticated,service_role;`);
await db.exec(readFileSync(new URL('../supabase/migrations/202610120001_account_deletion_requests.sql', import.meta.url), 'utf8'));
const alice = '10000000-0000-4000-8000-000000000001';
const bob = '10000000-0000-4000-8000-000000000002';
await db.exec(`insert into auth.users values ('${alice}'),('${bob}'); set role anon;`);
await assert.rejects(db.query('select public.request_account_deletion()'));
await assert.rejects(db.query('select * from public.account_deletion_requests'));
async function identity(id) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
await identity(alice);
const first = (await db.query('select public.request_account_deletion() as request')).rows[0].request;
const repeated = (await db.query('select public.request_account_deletion() as request')).rows[0].request;
assert.equal(first.id, repeated.id);
assert.equal(first.status, 'pending');
await assert.rejects(db.exec("update public.account_deletion_requests set status='processing'"));
await assert.rejects(db.exec('delete from public.account_deletion_requests'));
await assert.rejects(db.exec(`insert into public.account_deletion_requests(user_id) values ('${bob}')`));
await identity(bob);
assert.equal((await db.query('select * from public.account_deletion_requests')).rows.length, 0);
await db.query('select public.request_account_deletion()');
await db.exec('reset role');
assert.equal((await db.query('select * from auth.users')).rows.length, 2, 'Intake must not destroy user data');
assert.equal((await db.query('select * from public.account_deletion_requests')).rows.length, 2);
await db.close();
console.log('PASS: deletion intake denies anon, isolates users, prevents forged writes and duplicates, preserves accounts pending processing');
