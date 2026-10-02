import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// PostgreSQL engine with minimal Supabase auth/storage fixtures; no credentials required.
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('role', current_setting('request.jwt.claim.role', true)) $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1] $$;
`);
for (const name of ['202610020001_phase3a_foundation.sql', '202610020002_phase3a_stabilization.sql']) {
  const sql = readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
  await db.exec(sql.replace('create extension if not exists pgcrypto;', '')); // gen_random_uuid is built into PostgreSQL.
  if (name.includes('0001_')) {
    await db.exec(`insert into auth.users (id) values ('90000000-0000-4000-8000-000000000001');
      insert into authors (id,user_id,pen_name,followers_count) values ('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','Legacy author',99);
      insert into books (id,author_id,title,slug,followers_count) values ('90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002','Legacy book','legacy-book',99);
      insert into chapters (book_id,chapter_number,title,content,status) values ('90000000-0000-4000-8000-000000000003',1,'Empty published chapter','','published');`);
  }
  if (name.includes('0002_')) {
    assert.equal((await db.query("select role from profiles where id = '90000000-0000-4000-8000-000000000001'")).rows[0].role, 'author');
    assert.equal((await db.query("select status from chapters where book_id = '90000000-0000-4000-8000-000000000003'")).rows[0].status, 'draft');
    assert.equal(Number((await db.query("select followers_count from authors where id = '90000000-0000-4000-8000-000000000002'")).rows[0].followers_count), 0);
    assert.equal(Number((await db.query("select followers_count from books where id = '90000000-0000-4000-8000-000000000003'")).rows[0].followers_count), 0);
    await db.exec("delete from auth.users where id = '90000000-0000-4000-8000-000000000001'");
  }
}
await db.exec(`grant usage on schema public, auth, storage to anon, authenticated;
  grant select on all tables in schema public to anon;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.objects to anon;
`);
const u1 = '10000000-0000-4000-8000-000000000001';
const u2 = '10000000-0000-4000-8000-000000000002';
const a1 = '20000000-0000-4000-8000-000000000001';
const a2 = '20000000-0000-4000-8000-000000000002';
const b1 = '30000000-0000-4000-8000-000000000001';
const b2 = '30000000-0000-4000-8000-000000000002';
const c1 = '40000000-0000-4000-8000-000000000001';
const c2 = '40000000-0000-4000-8000-000000000002';
const comment = '50000000-0000-4000-8000-000000000001';
async function identity(user, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)", [user ?? '', role]);
  await db.exec(`set role ${role}`);
}
async function rows(sql) { return (await db.query(sql)).rows; }
async function rejects(sql) { await assert.rejects(db.exec(sql)); }
await db.exec(`insert into auth.users (id, raw_user_meta_data) values ('${u1}', '{"display_name":"Tác giả một"}'), ('${u2}', '{}');`);
assert.equal((await rows('select * from public.profiles')).length, 2, 'signup creates profiles');
await identity(u1);
await rejects(`update profiles set role = 'admin' where id = '${u1}'`);
await db.exec(`insert into authors (id, user_id, pen_name, verified, followers_count) values ('${a1}', '${u1}', 'Tác giả một', true, 999)`);
assert.equal((await rows(`select role from profiles where id = '${u1}'`))[0].role, 'author');
assert.equal((await rows(`select verified from authors where id = '${a1}'`))[0].verified, false);
await db.exec(`insert into books (id, author_id, title, slug, rating, views_count, total_chapters) values ('${b1}', '${a1}', 'Truyện một', 'truyen-mot', 5, 999, 999)`);
assert.equal((await rows(`select total_chapters from books where id = '${b1}'`))[0].total_chapters, 0);
await rejects(`insert into books (author_id, title, slug) values ('${a2}', 'Giả mạo', 'gia-mao')`);
await rejects(`insert into chapters (book_id, chapter_number, title, content, status) values ('${b1}', 1, 'Chương một', '', 'published')`);
await db.exec(`insert into chapters (id, book_id, chapter_number, title, content) values ('${c1}', '${b1}', 1, 'Chương một', repeat('Nội dung ', 20))`);
await rejects(`insert into chapters (book_id, chapter_number, title) values ('${b1}', 1, 'Trùng số')`);
await db.exec(`update chapters set status = 'published' where id = '${c1}'`);
const publishedAt = (await rows(`select published_at from chapters where id = '${c1}'`))[0].published_at;
assert.ok(publishedAt);
await db.exec(`update chapters set title = 'Tiêu đề mới', published_at = '2000-01-01' where id = '${c1}'`);
assert.equal(String((await rows(`select published_at from chapters where id = '${c1}'`))[0].published_at), String(publishedAt));
assert.equal((await rows(`select total_chapters from books where id = '${b1}'`))[0].total_chapters, 1);
await db.exec(`insert into chapters (id, book_id, chapter_number, title) values ('${c2}', '${b1}', 4, 'Nháp bí mật')`);
await identity(null, 'anon');
assert.equal((await rows('select * from books')).length, 0, 'draft books hidden');
assert.equal((await rows('select * from chapters')).length, 0, 'private chapters hidden');
await identity(u1);
await db.exec(`update books set status = 'ongoing', visibility = 'public' where id = '${b1}'`);
await identity(null, 'anon');
assert.equal((await rows('select * from books')).length, 1);
assert.equal((await rows('select * from chapters')).length, 1, 'draft chapters hidden');
await rejects(`insert into comments (user_id, book_id, content) values ('${u1}', '${b1}', 'Ẩn danh')`);
await identity(u2);
await db.exec(`insert into authors (id, user_id, pen_name) values ('${a2}', '${u2}', 'Tác giả hai');
insert into books (id, author_id, title, slug) values ('${b2}', '${a2}', 'Truyện hai', 'truyen-hai');`);
assert.equal((await rows(`update books set title = 'Tấn công' where id = '${b1}' returning id`)).length, 0);
assert.equal((await rows(`update chapters set content = 'Tấn công' where id = '${c1}' returning id`)).length, 0);
await rejects(`insert into chapters (book_id, chapter_number, title) values ('${b1}', 3, 'Tấn công')`);
await rejects(`insert into library (user_id, book_id) values ('${u1}', '${b1}')`);
await db.exec(`insert into library (user_id, book_id) values ('${u2}', '${b1}');
insert into reading_progress (user_id, book_id, chapter_id, chapter_number, progress_percent) values ('${u2}', '${b1}', '${c1}', 1, 50);
insert into bookmarks (user_id, book_id, chapter_id, chapter_number) values ('${u2}', '${b1}', '${c1}', 1);`);
await rejects(`update reading_progress set chapter_id = '${c2}', chapter_number = 4 where user_id = '${u2}'`);
await rejects(`insert into bookmarks (user_id, book_id, chapter_id, chapter_number) values ('${u2}', '${b2}', '${c1}', 1)`);
await db.exec(`insert into book_follows (user_id, book_id) values ('${u2}', '${b1}');
insert into author_follows (user_id, author_id) values ('${u2}', '${a1}');`);
assert.equal(Number((await rows(`select followers_count from books where id = '${b1}'`))[0].followers_count), 1);
await db.exec(`delete from book_follows where user_id = '${u2}';`);
assert.equal(Number((await rows(`select followers_count from books where id = '${b1}'`))[0].followers_count), 0);
await db.exec(`insert into comments (id, user_id, book_id, content) values ('${comment}', '${u2}', '${b1}', 'Bình luận công khai')`);
await rejects(`insert into comments (user_id, book_id, chapter_id, content) values ('${u2}', '${b1}', '${c2}', 'Bình luận nháp')`);
await rejects(`insert into comments (user_id, book_id, parent_id, content) values ('${u2}', '${b2}', '${comment}', 'Sai truyện')`);
await identity(u1);
assert.equal((await rows('select * from library')).length, 0, 'private library');
assert.equal((await rows('select * from reading_progress')).length, 0, 'private progress');
assert.equal((await rows('select * from bookmarks')).length, 0, 'private bookmarks');
assert.equal((await rows(`delete from comments where id = '${comment}' returning id`)).length, 0, 'cannot delete another comment');
await db.exec(`insert into storage.objects (bucket_id, name) values ('book-covers', '${u1}/${b1}/cover.jpg')`);
await rejects(`insert into storage.objects (bucket_id, name) values ('book-covers', '${u2}/${b2}/cover.jpg')`);
await rejects(`insert into storage.objects (bucket_id, name) values ('book-covers', '${u1}/${b2}/cover.jpg')`);
await db.exec(`update chapters set status = 'draft' where id = '${c1}'`);
assert.equal((await rows(`select published_at from chapters where id = '${c1}'`))[0].published_at, null);
assert.equal((await rows(`select total_chapters from books where id = '${b1}'`))[0].total_chapters, 0);
await identity(null, 'anon');
assert.equal((await rows('select * from chapters')).length, 0);
await db.exec('reset role');
assert.equal((await rows("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity")).length, 0, 'all tables enforce RLS');
await db.close();
console.log('PASS: migrations, signup/roles, ownership/RLS, publication, counters, progress/bookmark references, comments, storage');
