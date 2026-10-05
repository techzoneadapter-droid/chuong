import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL semantics, entirely local; no environment files or remote credentials.
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage; create schema cron;
create table cron.job(jobid bigint, jobname text);
create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
create function cron.unschedule(bigint) returns boolean language sql as $$ select true $$;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('role',current_setting('request.jwt.claim.role',true)) $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;`);
const migrationDir = new URL('../supabase/migrations/', import.meta.url);
for (const file of readdirSync(migrationDir).sort()) {
  // Apply real foundation, notification, entitlement, scheduler, and update migrations.
  if (file.startsWith('202610020') || (file >= '202610030001' && file < '202610030021') || (file >= '202610030031' && file < '202610030033') || (file >= '202610050012' && file < '202610050017') || (file >= '202610050020' && file <= '202610050021_followed_book_updates.sql')) {
    await db.exec(readFileSync(new URL(file,migrationDir),'utf8').replace('create extension if not exists pgcrypto;',''));
  }
}
await db.exec(`grant usage on schema public, auth to authenticated,service_role;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to service_role;`);

await db.exec(`revoke select on chapters from authenticated;
grant select(id,book_id,chapter_number,title,status,is_vip,price_coins,published_at,created_at,updated_at,moderation_state) on chapters to authenticated;`);

const reader = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const writer = '10000000-0000-4000-8000-000000000003';
const author = '20000000-0000-4000-8000-000000000001';
const book = '30000000-0000-4000-8000-000000000001';
const empty = '30000000-0000-4000-8000-000000000002';
async function identity(id, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id ?? '', role]);
  await db.exec(`set role ${role}`);
}
async function updates(args = '') { return (await db.query(`select * from get_my_followed_book_updates(${args})`)).rows; }
async function badge() { return (await db.query('select * from get_my_followed_book_update_badge()')).rows[0]; }
await db.exec(`select set_config('request.jwt.claim.role','service_role',false);
insert into auth.users(id) values('${reader}'),('${other}'),('${writer}');
insert into authors(id,user_id,pen_name) values('${author}','${writer}','Tác giả kiểm thử');
insert into books(id,author_id,title,slug,status,visibility) values
('${book}','${author}','Truyện số chương thưa','updates-test','ongoing','public'),
('${empty}','${author}','Truyện chưa phát hành','updates-empty','ongoing','public');
insert into chapters(book_id,chapter_number,title,content,status,is_vip,price_coins)
select '${book}', n, 'Chương ' || n, repeat('Nội dung bí mật ',20), 'published', n=8, case when n=8 then 10 else 0 end
from unnest(array[1,2,3,5,8]) n;
insert into chapters(book_id,chapter_number,title,content,status,moderation_state) values
('${book}',10,'Bị ẩn',repeat('Nội dung ',20),'published','hidden'),
('${book}',11,'Bị từ chối',repeat('Nội dung ',20),'published','rejected'),
('${book}',12,'Bản nháp',repeat('Nội dung ',20),'draft','approved');
insert into book_follows(user_id,book_id) values('${reader}','${book}'),('${reader}','${empty}'),('${other}','${book}');
insert into reading_progress(user_id,book_id,chapter_number,chapter_id)
select '${reader}','${book}',3,id from chapters where book_id='${book}' and chapter_number=3;`);

await identity(reader);
let result = (await updates())[0];
assert.equal(Number(result.unread_count), 2, 'A: count real rows beyond progress');
assert.equal(result.next_chapter_number, 5);
assert.equal(result.latest_chapter_number, 8);
assert.equal(Number(result.published_count), 5, 'D: exclude hidden/rejected/draft chapters');
assert.equal(result.author_name, 'Tác giả kiểm thử');
assert.equal(result.has_updates, true);
assert.ok(result.latest_published_at);
assert.equal('content' in result, false, 'F: VIP body never returned');
assert.equal(Number((await badge()).unread_chapters), 2);
assert.equal(Number((await badge()).updated_books), 1);
await assert.rejects(db.exec(`select content from chapters where book_id='${book}'`));
assert.equal((await db.query(`select * from get_chapter_for_reading('${book}',8)`)).rows[0].content, null, 'F: normal reader still requires VIP entitlement');

await identity(other);
result = (await updates())[0];
assert.equal(result.current_chapter_number, null, 'E: cannot see another reader progress');
assert.equal(result.next_chapter_number, 1, 'B: first available chapter');
assert.equal(Number(result.unread_count), 5);
await identity(reader);
await db.exec(`select sync_reading_progress('${book}',(select id from chapters where book_id='${book}' and chapter_number=8),8,100,0,now())`);
result = (await updates()).find(r => r.book_id === book);
assert.equal(Number(result.unread_count), 0, 'C: progress naturally clears updates');
assert.equal(result.next_chapter_number, null);
assert.equal(result.has_updates, false);
assert.equal((await updates('20,0,true')).length, 0);
assert.equal(Number((await badge()).unread_chapters), 0);
assert.equal((await updates('1,0')).length, 1, 'pagination');
assert.equal((await updates('1,1')).length, 1);
assert.equal((await updates('1,2')).length, 0);
result = (await updates()).find(r => r.book_id === empty);
assert.equal(result.next_chapter_number, null, 'no published chapters: no fake CTA');
assert.equal(result.latest_chapter_number, null);

await identity(null, 'anon');
await assert.rejects(db.exec('select * from get_my_followed_book_updates()'));
await assert.rejects(db.exec('select * from get_my_followed_book_update_badge()'));
await identity(null);
assert.equal((await updates()).length, 0, 'null auth cannot read follows');

await db.exec('reset role');
await db.exec(`select set_config('request.jwt.claim.role','service_role',false);
delete from chapters where book_id='${book}' and chapter_number in (1,2,3);
insert into chapters(book_id,chapter_number,title,content,scheduled_publish_at)
values('${book}',9,'Chương theo lịch',repeat('Nội dung ',20),now()-interval '1 minute');`);
await identity(other);
assert.equal((await updates())[0].next_chapter_number, 5, 'B: never assume chapter 1 exists');
await db.exec('reset role');
await db.exec(`select private.publish_due_chapters()`);
await identity(reader);
result = (await updates())[0];
assert.equal(result.latest_chapter_number, 9, 'G: scheduler reflected immediately');
assert.equal(result.next_chapter_number, 9);
assert.equal(Number(result.unread_count), 1);
let notifications = (await db.query(`select * from notifications where category='release'`)).rows;
assert.equal(notifications.length, 1, 'H: scheduled release notifies once');
assert.equal(notifications[0].action_route, `/reader/${book}?chapter=9`);
assert.equal(notifications[0].metadata.scheduled_release, true);
await db.exec('reset role');
await db.exec(`select private.publish_due_chapters(); update chapters set title='Tiêu đề sửa' where book_id='${book}' and chapter_number=9;`);
await identity(reader);
assert.equal((await db.query(`select * from notifications where category='release'`)).rows.length, 1, 'H: no duplicate release notifications');
await db.exec(`select update_notification_preferences(true,true,true,true,true,true,false,true,true)`);
await db.exec('reset role');
await db.exec(`update chapters set status='published' where book_id='${book}' and chapter_number=12;`);
await identity(reader);
assert.equal((await db.query(`select * from notifications where category='release'`)).rows.length, 1, 'H: new_chapters opt-out preserved');
assert.equal(Number((await badge()).unread_chapters), 2, 'updates independent of notification preference');
await identity(other);
notifications = (await db.query(`select * from notifications where category='release'`)).rows;
assert.equal(notifications.length, 2, 'H: manual publish notifies opted-in follower');
assert.ok(notifications.some(n => n.action_route === `/reader/${book}?chapter=12`));

await db.exec('reset role');
await db.exec(`delete from chapters where book_id='${book}' and chapter_number=8;`);
await identity(reader);
assert.equal((await updates())[0].current_chapter_number, 8, 'removed progress chapter retains numeric position');
assert.equal((await updates())[0].next_chapter_number, 9);
await db.exec('reset role');
for (const change of ["visibility='private'", "status='draft'", "moderation_state='hidden'", "moderation_state='rejected'"]) {
  await db.exec(`update books set ${change} where id='${book}'`);
  await identity(reader);
  assert.equal((await updates()).some(r => r.book_id === book), false, 'invalid book omitted');
  assert.equal(Number((await badge()).unread_chapters), 0);
  await db.exec('reset role');
  await db.exec(`update books set visibility='public',status='ongoing',moderation_state='approved' where id='${book}'`);
}
await db.exec(`update authors set moderation_state='hidden' where id='${author}'`);
await identity(writer);
assert.equal((await updates()).length, 0);
await identity(reader);
assert.equal((await updates()).length, 0, 'hidden author omitted');

await db.exec('reset role');
await db.exec('set enable_seqscan=off');
const plan = await db.query(`explain select count(*) from chapters where book_id='${book}' and status='published' and moderation_state='approved' and chapter_number>8`);
assert.match(JSON.stringify(plan.rows), /chapters_followed_updates_idx/, 'partial metadata index supports ahead scan');
const acl = (await db.query(`select proname,prosecdef,proconfig from pg_proc where proname in ('get_my_followed_book_updates','get_my_followed_book_update_badge')`)).rows;
assert.equal(acl.length, 2);
assert.ok(acl.every(r => !r.prosecdef && r.proconfig.includes('search_path=""')), 'invoker and locked search_path');
await db.close();
console.log('PASS: followed updates A–H, sparse chapters, metadata-only VIP, privacy, progress clearing, moderation, pagination, index plan, scheduled/manual notification regression');
