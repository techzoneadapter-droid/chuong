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
  if (file === '202610030033_phase4i_reviews.sql' || file === '202610030040_phase4k_social_community.sql' || file === '202610030044_phase4m_admin_catalog_author_credit.sql' || file.startsWith('202610020') || (file >= '202610030001' && file < '202610030021') || (file >= '202610030031' && file < '202610030033') || (file >= '202610050012' && file < '202610050017') || (file >= '202610050020' && file <= '202610050022_release_notification_batching.sql')) {
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
    const sql = readFileSync(new URL(file,migrationDir),'utf8').replace('create extension if not exists pgcrypto;','');
    // Search extensions are unrelated to R4; install actual credit column/constraint only.
    await db.exec(file.includes('admin_catalog_author_credit') ? sql.split('create or replace function')[0] : sql);
  }
}
await db.exec(`grant usage on schema public, auth to authenticated,service_role;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to service_role;`);

const migration = readFileSync(new URL('../supabase/migrations/202610050023_public_author_hub.sql',import.meta.url),'utf8');
const reader='11000000-0000-4000-8000-000000000001';
const writer='11000000-0000-4000-8000-000000000002';
const other='11000000-0000-4000-8000-000000000003';
const author='21000000-0000-4000-8000-000000000001';
const author2='21000000-0000-4000-8000-000000000002';
const rows=async sql=>(await db.query(sql)).rows;
const count=async sql=>Number((await rows(sql))[0].n);
const identity=async (id,role='authenticated')=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id??'',role]);
  await db.exec(`set role ${role}`);
};
const releases=()=>rows(`select * from notifications where event_type='book_published' and user_id='${reader}' order by created_at,id`);
const pushes=()=>count(`select count(*) n from push_deliveries d join notifications n on n.id=d.notification_id where n.event_type='book_published' and n.user_id='${reader}'`);
const createBook=async (slug,owner=author,visibility='public',status='ongoing',moderation='approved')=>{
  return (await rows(`insert into books(author_id,title,slug,visibility,status,moderation_state) values('${owner}','Truyện ${slug}','${slug}','${visibility}','${status}','${moderation}') returning id`))[0].id;
};
await db.exec(`insert into auth.users(id) values('${reader}'),('${writer}'),('${other}');
insert into authors(id,user_id,pen_name) values('${author}','${writer}','Tác giả kiểm thử'),('${author2}','${other}','Tác giả thứ hai');
insert into author_follows(user_id,author_id) values('${reader}','${author}');
insert into notification_preferences(user_id,new_chapters,push_enabled) values('${reader}',false,true);
insert into push_devices(user_id,device_key,expo_push_token,platform,enabled) values
('${reader}','enabled-1','ExponentPushToken[author-reader-1]','android',true),
('${reader}','enabled-2','ExponentPushToken[author-reader-2]','ios',true),
('${reader}','disabled','ExponentPushToken[author-reader-disabled]','ios',false);`);
const legacy=await createBook('existing');
await db.exec(migration);
assert.equal((await releases()).length,0,'D: installation never sends historical releases');
assert.ok((await rows(`select * from private.author_book_publications where book_id='${legacy}'`)).length);
await identity(reader);
let hub=(await rows(`select * from get_public_author_hub('${author}')`))[0];
assert.equal(hub.viewer_follows,true,'A: Book Detail table follow is reflected in hub');
assert.equal(hub.public_books_count,1);
assert.equal(hub.viewer_is_author,false);
await db.exec(`select set_reader_follow('${writer}',true); delete from author_follows where user_id='${reader}' and author_id='${author}'`);
assert.equal((await rows(`select * from author_follows where user_id='${reader}' and author_id='${author}'`)).length,0,'B: Book Detail refresh reads same table');
assert.equal((await rows(`select * from get_public_author_hub('${author}')`))[0].viewer_follows,false);
assert.equal((await rows(`select * from reader_follows where follower_id='${reader}'`)).length,1,'P: reader social follow preserved');
await db.exec(`insert into author_follows(user_id,author_id) values('${reader}','${author}'),('${reader}','${author2}')`);
assert.equal(Number((await rows(`select followers_count from authors where id='${author}'`))[0].followers_count),1);
// Backward compatible 8/9-arg callers cannot reset new_books opt-out.
await db.exec('select update_notification_preferences(true,true,true,true,true,true,false,true,true,false)');
await db.exec('select update_notification_preferences(true,true,true,true,true,true,false,true,true)');
await db.exec('select update_notification_preferences(true,true,true,true,true,true,true,true)');
assert.equal((await rows('select new_books from notification_preferences'))[0].new_books,false);
await db.exec('reset role');
await createBook('opt-out');
assert.equal((await releases()).length,0,'L: opt out prevents both in-app and push');
assert.equal(await pushes(),0);
await db.exec(`update notification_preferences set new_books=true where user_id='${reader}'`);
const first=await createBook('first');
let batch=(await releases())[0];
assert.equal((await releases()).length,1,'E: first public release');
assert.equal(batch.metadata.batch_count,1);
assert.equal(batch.action_route,`/book/${first}`);
assert.equal(await pushes(),2,'new_books independent from disabled new_chapters');
await db.exec(`update books set title='Tên mới',description='Mô tả mới',tags=array['test'] where id='${first}';
update books set moderation_state='hidden' where id='${first}';
update books set moderation_state='approved' where id='${first}';
update books set visibility='private' where id='${first}';
update books set visibility='public' where id='${first}';`);
assert.equal((await releases())[0].metadata.batch_count,1,'F/G/H: edits and restored publication never replay');
for(let i=2;i<=5;i++) await createBook(`batch-${i}`);
batch=(await releases())[0];
assert.equal((await releases()).length,1);
assert.equal(batch.metadata.batch_count,5,'I: five books one author one row');
assert.equal(batch.action_route,`/creator/${author}`);
assert.equal(await pushes(),2,'I: exactly one initial push per enabled device');
await createBook('different-author',author2);
assert.equal((await releases()).length,2,'J: separate author batches');
assert.equal(await pushes(),4);
// Deterministic local clock executes the real function at the next UTC hour.
const definition=(await rows(`select pg_get_functiondef('private.publish_author_book(uuid)'::regprocedure) sql`))[0].sql;
await db.exec(`create function private.author_test_clock() returns timestamptz language sql as $$ select current_setting('test.author_clock')::timestamptz $$`);
await db.exec(definition.replace('statement_timestamp()','private.author_test_clock()'));
await db.exec(`select set_config('test.author_clock',(date_trunc('hour',statement_timestamp())+interval '1 hour')::text,false); set timezone='Asia/Ho_Chi_Minh'`);
await createBook('next-hour');
assert.equal((await releases()).length,3,'K: next UTC hour starts new batch');
assert.equal(await pushes(),6);
await db.exec(`update notification_preferences set push_enabled=false where user_id='${reader}';
select set_config('test.author_clock',(current_setting('test.author_clock')::timestamptz+interval '1 hour')::text,false)`);
await createBook('no-push');
assert.equal((await releases()).length,4,'M: in-app preserved with push disabled');
assert.equal(await pushes(),6);
// Author approval can make books genuinely public for the first time.
await db.exec(`update authors set moderation_state='hidden' where id='${author2}';
update notification_preferences set new_books=true,push_enabled=true where user_id='${reader}'`);
const beforeApproval=(await releases()).filter(r=>r.metadata.author_id===author2).map(r=>r.metadata.batch_count).reduce((a,b)=>a+b,0);
const pending=await createBook('author-pending',author2);
assert.equal((await rows(`select * from private.author_book_publications where book_id='${pending}'`)).length,0);
await db.exec(`update authors set moderation_state='approved' where id='${author2}'`);
assert.equal((await releases()).filter(r=>r.metadata.author_id===author2).map(r=>r.metadata.batch_count).reduce((a,b)=>a+b,0),beforeApproval+1);
// Arbitrary display credit never maps a book to another author's followers.
const ownedBefore=(await releases()).filter(r=>r.metadata.author_id===author).map(r=>r.metadata.batch_count).reduce((a,b)=>a+b,0);
await db.exec(`insert into books(author_id,title,slug,credited_author_name,visibility,status)
values('${author2}','Truyện ghi tên tác giả','credited-import','Tác giả kiểm thử','public','ongoing')`);
assert.equal((await releases()).filter(r=>r.metadata.author_id===author).map(r=>r.metadata.batch_count).reduce((a,b)=>a+b,0),ownedBefore);
// C/O: mixed catalog, owner also cannot see drafts through public RPC.
for(const [slug,vis,status,mod] of [['draft','public','draft','approved'],['private','private','ongoing','approved'],['hidden','public','ongoing','hidden'],['rejected','public','ongoing','rejected']]) await createBook(slug,author,vis,status,mod);
await identity(writer);
const catalog=await rows(`select * from get_public_author_books('${author}',20,0)`);
assert.ok(catalog.length>0);
assert.ok(!catalog.some(b=>['Truyện draft','Truyện private','Truyện hidden','Truyện rejected'].includes(b.title)));
assert.ok(catalog.every(b=>!('content' in b)&&!('moderation_note' in b)));
assert.equal((await rows(`select * from get_public_author_hub('${author}')`))[0].viewer_is_author,true);
assert.ok(!('user_id' in hub));
await identity(null,'anon');
assert.ok((await rows(`select * from get_public_author_hub('${author}')`)).length,'N: anonymous public read');
await assert.rejects(db.exec(`insert into author_follows(user_id,author_id) values('${other}','${author}')`));
await db.exec('reset role');
// Pagination cap, stable ordering, and author moderation.
for(let i=0;i<22;i++) await createBook(`page-${i}`);
const page1=await rows(`select * from get_public_author_books('${author}',100,0)`);
const page2=await rows(`select * from get_public_author_books('${author}',20,20)`);
assert.equal(page1.length,20);
assert.ok(page2.length>0);
assert.ok(!page2.some(b=>page1.some(a=>a.id===b.id)));
await db.exec(`update authors set moderation_state='hidden' where id='${author}'`);
assert.equal((await rows(`select * from get_public_author_hub('${author}')`)).length,0);
assert.equal((await rows(`select * from get_public_author_books('${author}')`)).length,0);
await db.exec(`update authors set moderation_state='approved' where id='${author}'`);
// Block protection: no hub metadata and no direct follow insert across blocks.
await identity(reader);
await db.exec(`select set_reader_block('${writer}',true); delete from author_follows where author_id='${author}'`);
assert.equal((await rows(`select * from get_public_author_hub('${author}')`)).length,0);
await assert.rejects(db.exec(`insert into author_follows(user_id,author_id) values('${reader}','${author}')`));
await db.exec('reset role');
for(const role of ['anon','authenticated']) {
  assert.equal((await rows(`select has_table_privilege('${role}','private.author_book_publications','select') allowed`))[0].allowed,false);
  for(const fn of ['private.publish_author_book(uuid)','private.notify_author_book_publish()']) assert.equal((await rows(`select has_function_privilege('${role}','${fn}','execute') allowed`))[0].allowed,false);
}
assert.equal((await rows(`select relrowsecurity from pg_class where oid='private.author_book_publications'::regclass`))[0].relrowsecurity,true);
assert.equal((await rows(`select proconfig from pg_proc where oid='private.publish_author_book(uuid)'::regprocedure`))[0].proconfig[0],'search_path=""');
for(const row of await releases()) assert.deepEqual(Object.keys(row.metadata).sort(),['author_id','book_id','book_title','latest_book_id','latest_book_title','batch_count','batch_started_at','batch_updated_at'].sort());
await db.exec(definition);
await db.exec(readFileSync(new URL('./author-releases-production.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('./release-batching-production.sql',import.meta.url),'utf8'));
await db.close();
console.log('PASS: author hub/follow sync, catalog privacy/pagination, historical seed, first release/idempotency, UTC batching, push devices/preferences, social/block preservation, private permissions');
