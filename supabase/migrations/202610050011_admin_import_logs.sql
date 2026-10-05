-- CHUONG Phase 4O1: audit trail for large admin imports.
begin;

create table if not exists public.admin_import_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid null references public.books(id) on delete set null,
  source_name text not null default '',
  book_title text not null default '',
  credited_author_name text not null default '',
  chapter_count integer not null default 0 check (chapter_count >= 0),
  word_count bigint not null default 0 check (word_count >= 0),
  status text not null check (status in ('started','completed','failed')),
  detail text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists admin_import_logs_created_idx
  on public.admin_import_logs(created_at desc);
create index if not exists admin_import_logs_book_idx
  on public.admin_import_logs(book_id, created_at desc);

alter table public.admin_import_logs enable row level security;

drop policy if exists "admins read import logs" on public.admin_import_logs;
create policy "admins read import logs"
on public.admin_import_logs for select
to authenticated
using ((select private.is_admin()));

drop policy if exists "admins insert import logs" on public.admin_import_logs;
create policy "admins insert import logs"
on public.admin_import_logs for insert
to authenticated
with check (
  admin_user_id = (select auth.uid())
  and (select private.is_admin())
);

drop policy if exists "admins update own import logs" on public.admin_import_logs;
create policy "admins update own import logs"
on public.admin_import_logs for update
to authenticated
using (
  admin_user_id = (select auth.uid())
  and (select private.is_admin())
)
with check (
  admin_user_id = (select auth.uid())
  and (select private.is_admin())
);

revoke all on public.admin_import_logs from anon;
grant select, insert, update on public.admin_import_logs to authenticated;

commit;