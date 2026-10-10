import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
process.on('uncaughtException',error=>{console.error(error.message);process.exitCode=1;});
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage; create schema cron;
create table cron.job(jobid bigint,jobname text);
create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
create function cron.unschedule(bigint) returns boolean language sql as $$ select true $$;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('role',current_setting('request.jwt.claim.role',true)) $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;`);
const dir=new URL('../supabase/migrations/',import.meta.url);
for(const file of readdirSync(dir).sort())if(file.startsWith('202610020')||(file>='202610030001'&&file<'202610030018')||(file>='202610050001'&&file<'202610050005'))await db.exec(readFileSync(new URL(file,dir),'utf8').replace('create extension if not exists pgcrypto;',''));
await db.exec(`grant usage on schema public,auth to anon,authenticated,service_role;
grant select on all tables in schema public to anon;
grant select,insert,update,delete on all tables in schema public to authenticated,service_role;`);
// Reproduce the historical table-wide grant, then prove the new migration closes it.
await db.exec(readFileSync(new URL('202610040004_restore_chapter_read_grants.sql',dir),'utf8'));
await db.exec(readFileSync(new URL('202610050005_restore_reader_impl_execute.sql',dir),'utf8'));
await db.exec(readFileSync(new URL('202610050012_scheduled_chapter_publishing.sql',dir),'utf8'));
await db.exec(readFileSync(new URL('20261010164000_book_free_preview_chapters.sql',dir),'utf8'));
const reader='10000000-0000-4000-8000-000000000001',writer='10000000-0000-4000-8000-000000000002',admin='10000000-0000-4000-8000-000000000003';
const author='20000000-0000-4000-8000-000000000001',book='30000000-0000-4000-8000-000000000001';
await db.exec(`insert into auth.users(id) values('${reader}'),('${writer}'),('${admin}');
select set_config('request.jwt.claim.role','service_role',false);
update profiles set role='admin' where id='${admin}';
insert into authors(id,user_id,pen_name) values('${author}','${writer}','Writer');
insert into books(id,author_id,title,slug,is_vip,price_coins) values('${book}','${author}','Preview','preview',true,100);
insert into chapters(book_id,chapter_number,title,content,is_vip,price_coins,status)
select '${book}',n,'Chapter '||n,repeat('Authorized story ',100),true,10,'published' from generate_series(1,51) n;
update books set visibility='public',status='ongoing' where id='${book}';`);
async function identity(id='',role='authenticated'){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]);
  await db.exec(`set role ${role}`);
}
async function read(n){return (await db.query('select * from get_chapter_for_reading($1,$2)',[book,n])).rows[0];}
async function root(sql){await db.exec('reset role');return db.exec(sql);}
for(const limit of [0,5,10,50,7]){
  await root(`update books set free_preview_chapters=${limit} where id='${book}'`);
  for(const [id,role] of [['','anon'],[reader,'authenticated']]){
    await identity(id,role);
    if(limit)assert.ok((await read(limit)).content,`${role} reads N=${limit}`);
    const next=await read(limit+1);assert.equal(next.content,null);assert.equal(next.lock_kind,'book');
    await assert.rejects(db.exec('select content from chapters'),/permission denied/);
    await assert.rejects(db.exec('select * from chapters'),/permission denied/);
    assert.equal((await db.query('select chapter_number from chapters')).rows.length,51);
  }
}
await root(`update books set is_vip=false,free_preview_chapters=5 where id='${book}'`);
await identity('', 'anon');assert.ok((await read(5)).content);assert.equal((await read(6)).lock_kind,'chapter');
for(const restriction of ["update chapters set status='draft' where chapter_number=5", "update chapters set moderation_state='hidden' where chapter_number=5", "update books set visibility='private'", "update books set moderation_state='hidden'", "update authors set moderation_state='hidden'"]){
  await root(restriction);await identity('','anon');assert.equal(await read(5),undefined,restriction);
  await root("update chapters set status='published',moderation_state='approved';update books set visibility='public',moderation_state='approved';update authors set moderation_state='approved'");
}
await identity(reader);
await db.exec(`update books set free_preview_chapters=50 where id='${book}'`);
assert.equal((await db.query(`select free_preview_chapters from books where id='${book}'`)).rows[0].free_preview_chapters,5,'Reader cannot update author book');
await assert.rejects(db.query('select * from get_admin_chapters_for_editing($1)',[book]),/admin_required/);
assert.equal((await db.query('select * from get_author_chapter_for_editing($1,$2)',[book,(await db.query('select id from chapters where chapter_number=1')).rows[0].id])).rows.length,0,'Other users receive no author-editing body');
await identity(writer);await db.exec(`update books set free_preview_chapters=10 where id='${book}'`);
assert.equal((await db.query(`select free_preview_chapters from books where id='${book}'`)).rows[0].free_preview_chapters,10);
const cid=(await db.query('select id from chapters where chapter_number=1')).rows[0].id;
assert.ok((await db.query('select * from get_author_chapter_for_editing($1,$2)',[book,cid])).rows[0].content);
await identity(admin);assert.equal((await db.query('select * from get_admin_chapters_for_editing($1)',[book])).rows.length,51);
await db.exec(`update books set free_preview_chapters=50 where id='${book}'`);
await assert.rejects(db.exec(`update books set free_preview_chapters=-1 where id='${book}'`),/books_free_preview_chapters_range/);
await assert.rejects(db.exec(`update books set free_preview_chapters=100001 where id='${book}'`),/books_free_preview_chapters_range/);
await root(`insert into book_entitlements(user_id,book_id,source,price_paid_coins) values('${reader}','${book}','admin_grant',100);
update books set is_vip=true,free_preview_chapters=0 where id='${book}'`);
await identity(reader);assert.ok((await read(51)).content,'Purchased entitlement survives preview reduction');
await root('');
assert.equal(Number((await db.query('select count(*) n from wallet_transactions')).rows[0].n),0,'Preview does not create financial transactions');
assert.equal((await db.query('select revoked_at from book_entitlements')).rows[0].revoked_at,null);
await root(`update books set free_preview_chapters=5 where id='${book}'`);
await db.exec(readFileSync(new URL('../supabase/rollback/20261010164000_free_preview.sql',import.meta.url),'utf8'));
await identity('','anon');assert.equal((await read(1)).content,null,'Emergency rollback disables preview');
await assert.rejects(db.exec('select content from chapters'),/permission denied/);
await identity(reader);assert.ok((await read(51)).content,'Rollback retains bought access');
await identity(admin);assert.equal((await db.query('select * from get_admin_chapters_for_editing($1)',[book])).rows.length,51);
await db.close();
console.log('PASS: PostgreSQL guest/reader/owner/admin, N=0/5/10/50/custom, book/chapter VIP, publication guards, raw body denial, editing RPCs, RLS, bounds and retained entitlements');
