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
  if (file.startsWith('202610020') || (file >= '202610030001' && file < '202610030021') || (file >= '202610030031' && file < '202610030033') || (file >= '202610050012' && file < '202610050017') || (file >= '202610050020' && file <= '202610050022_release_notification_batching.sql')) {
    if (file === '202610050022_release_notification_batching.sql') {
      // Upgrade coverage: seed real R1 events before installing R3, including a
      // previously published chapter that has since been returned to draft.
      await db.exec(`select set_config('request.jwt.claim.role','service_role',false);
        insert into auth.users(id) values('91000000-0000-4000-8000-000000000001');
        insert into authors(id,user_id,pen_name) values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Tác giả R1');
        insert into books(id,author_id,title,slug,status,visibility) values('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Truyện R1','legacy-r1-batch','ongoing','public');
        insert into book_follows(user_id,book_id) values('91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');
        insert into chapters(book_id,chapter_number,title,content)
          select '93000000-0000-4000-8000-000000000001',n,'Chương R1 '||n,repeat('Nội dung ',20) from generate_series(1,2) n;
        update chapters set status='published' where book_id='93000000-0000-4000-8000-000000000001';
        update chapters set status='draft' where book_id='93000000-0000-4000-8000-000000000001' and chapter_number=2;`);
    }
    await db.exec(readFileSync(new URL(file,migrationDir),'utf8').replace('create extension if not exists pgcrypto;',''));
  }
}
await db.exec(`grant usage on schema public, auth to authenticated,service_role;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to service_role;`);

assert.equal(Number((await db.query('select count(*) as n from private.chapter_release_publications')).rows[0].n),2,'migration seeds published and historical R1 events');
await db.exec(`update chapters set status='published' where book_id='93000000-0000-4000-8000-000000000001'`);
assert.equal(Number((await db.query("select count(*) as n from notifications where category='release'")).rows[0].n),2,'migration preserves R1 rows without replay notifications');
// Match the hardened production chapter column grants: metadata only.
await db.exec(`revoke select on chapters from authenticated;
grant select(id,book_id,chapter_number,title,status,is_vip,price_coins,published_at,created_at,updated_at,moderation_state) on chapters to authenticated;`);
const reader = '11000000-0000-4000-8000-000000000001';
const other = '11000000-0000-4000-8000-000000000002';
const writer = '11000000-0000-4000-8000-000000000003';
const author = '21000000-0000-4000-8000-000000000001';
const book = '31000000-0000-4000-8000-000000000001';
const scheduledBook = '31000000-0000-4000-8000-000000000002';
const rows = async sql => (await db.query(sql)).rows;
const notifications = async (id = book, uid = reader) => rows(`select * from notifications where category='release' and user_id='${uid}' and metadata->>'book_id'='${id}' order by created_at,id`);
const pushes = async () => Number((await rows('select count(*) as n from push_deliveries'))[0].n);
const publish = async n => db.exec(`update chapters set status='published' where book_id='${book}' and chapter_number=${n}`);
const identity = async id => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[id]);
  await db.exec('set role authenticated');
};
await db.exec(`select set_config('request.jwt.claim.role','service_role',false);
insert into auth.users(id) values('${reader}'),('${other}'),('${writer}');
insert into authors(id,user_id,pen_name) values('${author}','${writer}','Tác giả kiểm thử');
insert into books(id,author_id,title,slug,status,visibility) values
('${book}','${author}','Kiếm Yên Vân','batch-manual','ongoing','public'),
('${scheduledBook}','${author}','Truyện theo lịch','batch-scheduled','ongoing','public');
insert into book_follows(user_id,book_id) values('${reader}','${book}'),('${reader}','${scheduledBook}'),('${other}','${book}');
insert into notification_preferences(user_id,push_enabled) values('${reader}',true),('${other}',true);
insert into push_devices(user_id,device_key,expo_push_token,platform,enabled,invalidated_at) values
('${reader}','reader-device-1','ExponentPushToken[fixture-reader-1]','android',true,null),
('${reader}','reader-device-2','ExponentPushToken[fixture-reader-2]','ios',true,null),
('${reader}','reader-disabled','ExponentPushToken[fixture-disabled]','ios',false,null),
('${reader}','reader-invalid','ExponentPushToken[fixture-invalid]','ios',true,now()),
('${other}','other-device-1','ExponentPushToken[fixture-other-1]','android',true,null);
insert into chapters(book_id,chapter_number,title,content,is_vip,price_coins)
select '${book}',n,'Tên chương '||n,repeat('Bí mật VIP ',20),n=101,case when n=101 then 10 else 0 end
from unnest(array[101,103,108,120,150,200,201,202]) n;`);

// A: real migration clock, manual publication and INSERT publication path.
await identity(writer);
await publish(101);
await db.exec('reset role');
let batch = (await notifications())[0];
assert.equal((await notifications()).length,1);
assert.equal(batch.metadata.batch_count,1);
assert.equal(batch.metadata.latest_chapter_number,101);
assert.equal(batch.metadata.latest_chapter_id,batch.metadata.chapter_id);
assert.equal(batch.action_route,`/reader/${book}?chapter=101`);
assert.equal(batch.metadata.scheduled_release,false);
assert.match(batch.metadata.batch_started_at,/Z$/);
assert.equal(batch.dedupe_key,`chapter_release_batch:${book}:${reader}:`+(await rows(`select to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24') as bucket`))[0].bucket);
assert.equal(await pushes(),3,'one per enabled, non-invalidated device across two readers');
const batchId = batch.id;
await db.exec(`update notifications set read_at=now() where id='${batchId}'; update push_deliveries set status='delivered',delivered_at=now()`);

// B/I: count publications, not the difference between sparse chapter numbers.
await identity(writer);
for (const n of [103,108,120,150]) await publish(n);
await db.exec('reset role');
batch = (await notifications())[0];
assert.equal((await notifications()).length,1);
assert.equal(batch.id,batchId);
assert.equal(batch.metadata.batch_count,5);
assert.equal(batch.metadata.latest_chapter_number,150);
assert.equal(batch.action_route,'/updates');
assert.equal(batch.body,'Kiếm Yên Vân vừa có 5 chương mới');
assert.ok(batch.read_at,'read state remains intact');
assert.equal(await pushes(),3,'updates do not queue or retry pushes already delivered');
assert.equal((await notifications(book,other))[0].metadata.batch_count,5,'separate reader batch');

// C/D/G: one scheduler run publishes five chapters; another book is separate.
await db.exec(`insert into chapters(book_id,chapter_number,title,content,scheduled_publish_at)
select '${scheduledBook}',n,'Theo lịch '||n,repeat('Nội dung ',20),now()-interval '1 minute' from generate_series(1,5) n;`);
assert.equal((await rows('select private.publish_due_chapters() as n'))[0].n,5);
assert.equal((await notifications(scheduledBook)).length,1);
assert.equal((await notifications(scheduledBook))[0].metadata.batch_count,5);
assert.equal((await notifications(scheduledBook))[0].metadata.scheduled_release,true);
assert.equal((await notifications(scheduledBook))[0].action_route,'/updates');
assert.equal(await pushes(),5,'one batch/device for the second book');
assert.equal((await rows('select private.publish_due_chapters() as n'))[0].n,0);
assert.equal(await pushes(),5);

// F: title/content edits, explicit published status, and publication replay.
await identity(writer);
await db.exec(`update chapters set title='Tiêu đề sửa',content=repeat('Nội dung sửa ',20),status='published' where book_id='${book}' and chapter_number=101`);
await db.exec('reset role');
assert.equal((await notifications())[0].metadata.batch_count,5);
assert.equal(await pushes(),5);
await identity(writer);
await db.exec(`update chapters set status='draft' where book_id='${book}' and chapter_number=101`);
await publish(101);
await db.exec('reset role');
assert.equal((await notifications())[0].metadata.batch_count,5,'replayed publication claimed once');

// E: replace ONLY the time source in a local copy of the actual function.
// Never install a controllable test clock in production. This covers exact hour
// boundaries/timezones without wall-clock waits or a separate batching model.
const definition = (await rows(`select pg_get_functiondef('private.notify_book_followers_on_chapter_publish()'::regprocedure) as sql`))[0].sql;
await db.exec(`create function private.release_test_clock() returns timestamptz language sql as $$ select current_setting('test.release_clock')::timestamptz $$;`);
await db.exec(definition.replace('statement_timestamp()', 'private.release_test_clock()'));
await db.exec(`select set_config('test.release_clock',(date_trunc('hour',statement_timestamp() at time zone 'UTC')+interval '1 hour')::text||'+00',false); set timezone='Asia/Ho_Chi_Minh';`);
await identity(writer);
await publish(200);
await db.exec('reset role');
let batches = await notifications();
assert.equal(batches.length,2,'next UTC hour creates another notification');
let later = batches.find(n=>n.id!==batchId);
assert.equal(later.metadata.batch_count,1);
assert.equal(later.action_route,`/reader/${book}?chapter=200`);
assert.match(later.metadata.batch_started_at,/Z$/);
assert.equal(await pushes(),8);
await db.exec(`select set_config('test.release_clock',((current_setting('test.release_clock')::timestamptz at time zone 'UTC')+interval '59 minutes 59 seconds')::text||'+00',false); set timezone='America/New_York';`);
await identity(writer);
await publish(201);
await db.exec('reset role');
assert.equal((await notifications()).length,2,'same UTC bucket regardless of session timezone');
assert.equal((await notifications()).find(n=>n.id!==batchId).metadata.batch_count,2);
assert.equal(await pushes(),8);
await identity(writer);
await db.exec(`update chapters set status='draft' where book_id='${book}' and chapter_number=101`);
await publish(101);
await db.exec('reset role');
assert.equal((await notifications()).find(n=>n.id!==batchId).metadata.batch_count,2,'old event replay does not increment new hour');

// H/J/K: opt-out does not change actual unread state or grant VIP access.
await identity(reader);
await db.exec('select update_notification_preferences(true,true,true,true,true,true,false,true,true)');
await identity(other);
await db.exec('select update_notification_preferences(true,true,true,true,true,true,false,true,true)');
await identity(writer);
await publish(202);
await db.exec('reset role');
assert.equal((await notifications()).length,2);
assert.equal((await notifications()).find(n=>n.id!==batchId).metadata.batch_count,2);
assert.equal(await pushes(),8,'opt-out creates neither notification nor push');
await identity(reader);
let updates = await rows('select * from get_my_followed_book_updates()');
assert.equal(Number(updates.find(n=>n.book_id===book).unread_count),8);
assert.equal(Number((await rows('select * from get_my_followed_book_update_badge()'))[0].unread_chapters),13);
assert.equal((await rows(`select * from get_chapter_for_reading('${book}',101)`))[0].content,null);
await assert.rejects(db.exec(`select content from chapters where book_id='${book}'`),'direct chapter content access remains denied');
assert.ok(updates.every(n=>!('content' in n)));
await db.exec(`select sync_reading_progress('${book}',(select id from chapters where book_id='${book}' and chapter_number=108),108,100,0,now())`);
updates = await rows('select * from get_my_followed_book_updates()');
assert.equal(Number(updates.find(n=>n.book_id===book).unread_count),5);
assert.equal(updates.find(n=>n.book_id===book).next_chapter_number,120);
await db.exec('reset role');
for (const n of await rows("select metadata from notifications where category='release' and dedupe_key like 'chapter_release_batch:%'")) {
  assert.deepEqual(Object.keys(n.metadata).sort(),['batch_count','batch_started_at','batch_updated_at','book_id','chapter_id','chapter_number','latest_chapter_id','latest_chapter_number','scheduled_release'].sort());
  assert.ok(!JSON.stringify(n.metadata).includes('Bí mật'));
}

// Direct INSERT of a published chapter must also notify (OLD is unavailable).
await db.exec(`update notification_preferences set new_chapters=true where user_id='${reader}';
insert into chapters(book_id,chapter_number,title,content,status) values('${scheduledBook}',10,'Xuất bản trực tiếp',repeat('Nội dung ',20),'published');`);
assert.equal((await notifications(scheduledBook)).find(n=>n.metadata.latest_chapter_number===10).metadata.batch_count,1);
assert.equal(await pushes(),10);

// Security: private ledger and trigger helpers stay inaccessible to clients.
for (const role of ['anon','authenticated']) {
  assert.equal((await rows(`select has_function_privilege('${role}','private.notify_book_followers_on_chapter_publish()','execute') as allowed`))[0].allowed,false);
  assert.equal((await rows(`select has_table_privilege('${role}','private.chapter_release_publications','select') as allowed`))[0].allowed,false);
}
assert.equal((await rows(`select proconfig from pg_proc where oid='private.notify_book_followers_on_chapter_publish()'::regprocedure`))[0].proconfig[0],'search_path=""');
assert.equal((await rows(`select relrowsecurity from pg_class where oid='private.chapter_release_publications'::regclass`))[0].relrowsecurity,true);
assert.match((await rows(`select pg_get_triggerdef(oid) as sql from pg_trigger where tgname='queue_notification_push_insert'`))[0].sql,/AFTER INSERT ON/);
// Run the production smoke test locally too, restoring the unmodified clock.
await db.exec(definition);
await db.exec(readFileSync(new URL('./release-batching-production.sql', import.meta.url),'utf8'));
await db.close();
console.log('PASS: release batching A–K, enabled-device push counts, UTC boundary/timezones, publication replay, private permissions, real Update Center and VIP entitlement checks');
