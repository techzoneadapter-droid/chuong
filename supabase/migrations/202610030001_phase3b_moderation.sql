-- CHUONG Phase 3B: moderation, reports, copyright, admin controls
begin;

do $$ begin
  create type public.moderation_state as enum ('approved','hidden','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_reason as enum ('copyright','plagiarism','spam','harassment','inappropriate','impersonation','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open','reviewing','resolved','rejected');
exception when duplicate_object then null; end $$;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'::public.user_role
    ),
    false
  );
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

alter table public.authors
  add column if not exists moderation_state public.moderation_state not null default 'approved',
  add column if not exists moderation_note text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null;

alter table public.books
  add column if not exists moderation_state public.moderation_state not null default 'approved',
  add column if not exists moderation_note text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null;

alter table public.chapters
  add column if not exists moderation_state public.moderation_state not null default 'approved',
  add column if not exists moderation_note text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null;

alter table public.comments
  add column if not exists moderation_state public.moderation_state not null default 'approved',
  add column if not exists moderation_note text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  book_id uuid references public.books(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  author_id uuid references public.authors(id) on delete cascade,
  reason public.report_reason not null,
  details text not null default '',
  status public.report_status not null default 'open',
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_one_target check (num_nonnulls(book_id, chapter_id, comment_id, author_id) = 1),
  constraint reports_details_length check (char_length(details) <= 5000),
  constraint reports_resolution_length check (resolution_note is null or char_length(resolution_note) <= 5000)
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('book','chapter','comment','author')),
  target_id uuid not null,
  action text not null check (action in ('approve','hide','reject','resolve_report','reject_report')),
  reason text,
  report_id uuid references public.reports(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reports_status_created_idx on public.reports (status, created_at desc);
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index if not exists reports_book_idx on public.reports (book_id) where book_id is not null;
create index if not exists reports_chapter_idx on public.reports (chapter_id) where chapter_id is not null;
create index if not exists reports_comment_idx on public.reports (comment_id) where comment_id is not null;
create index if not exists reports_author_idx on public.reports (author_id) where author_id is not null;
create index if not exists reports_assigned_admin_idx on public.reports (assigned_admin_id, status);
create index if not exists moderation_actions_target_idx on public.moderation_actions (target_type, target_id, created_at desc);
create index if not exists moderation_actions_admin_idx on public.moderation_actions (admin_id, created_at desc);

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

create or replace function public.protect_moderation_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres','supabase_admin','service_role') or (select private.is_admin()) then
    return new;
  end if;

  if new.moderation_state is distinct from old.moderation_state
     or new.moderation_note is distinct from old.moderation_note
     or new.moderated_at is distinct from old.moderated_at
     or new.moderated_by is distinct from old.moderated_by then
    raise exception 'Only administrators can change moderation fields' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_author_moderation on public.authors;
create trigger protect_author_moderation
before update on public.authors
for each row execute function public.protect_moderation_fields();

drop trigger if exists protect_book_moderation on public.books;
create trigger protect_book_moderation
before update on public.books
for each row execute function public.protect_moderation_fields();

drop trigger if exists protect_chapter_moderation on public.chapters;
create trigger protect_chapter_moderation
before update on public.chapters
for each row execute function public.protect_moderation_fields();

drop trigger if exists protect_comment_moderation on public.comments;
create trigger protect_comment_moderation
before update on public.comments
for each row execute function public.protect_moderation_fields();

alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;

drop policy if exists "users submit own reports" on public.reports;
create policy "users submit own reports" on public.reports
for insert to authenticated
with check ((select auth.uid()) = reporter_id);

drop policy if exists "users read own reports" on public.reports;
create policy "users read own reports" on public.reports
for select to authenticated
using ((select auth.uid()) = reporter_id or (select private.is_admin()));

drop policy if exists "admins update reports" on public.reports;
create policy "admins update reports" on public.reports
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "admins read moderation actions" on public.moderation_actions;
create policy "admins read moderation actions" on public.moderation_actions
for select to authenticated
using ((select private.is_admin()));

-- Tighten public content visibility while preserving owner/admin access.
alter policy "authors are readable" on public.authors
using (
  moderation_state = 'approved'
  or user_id = (select auth.uid())
  or (select private.is_admin())
);

alter policy "public or owned books are readable" on public.books
using (
  (
    visibility = 'public'
    and status <> 'draft'
    and moderation_state = 'approved'
    and exists (
      select 1 from public.authors a
      where a.id = author_id and a.moderation_state = 'approved'
    )
  )
  or exists (
    select 1 from public.authors a
    where a.id = author_id and a.user_id = (select auth.uid())
  )
  or (select private.is_admin())
);

alter policy "genres follow book visibility" on public.book_genres
using (
  exists (
    select 1
    from public.books b
    join public.authors a on a.id = b.author_id
    where b.id = book_id
      and (
        (
          b.visibility = 'public'
          and b.status <> 'draft'
          and b.moderation_state = 'approved'
          and a.moderation_state = 'approved'
        )
        or a.user_id = (select auth.uid())
        or (select private.is_admin())
      )
  )
);

alter policy "published or owned chapters are readable" on public.chapters
using (
  (
    status = 'published'
    and moderation_state = 'approved'
    and exists (
      select 1
      from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_id
        and b.visibility = 'public'
        and b.status <> 'draft'
        and b.moderation_state = 'approved'
        and a.moderation_state = 'approved'
    )
  )
  or exists (
    select 1 from public.books b
    join public.authors a on a.id = b.author_id
    where b.id = book_id and a.user_id = (select auth.uid())
  )
  or (select private.is_admin())
);

alter policy "comments on public books are readable" on public.comments
using (
  (
    moderation_state = 'approved'
    and exists (
      select 1
      from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_id
        and b.visibility = 'public'
        and b.status <> 'draft'
        and b.moderation_state = 'approved'
        and a.moderation_state = 'approved'
    )
    and (
      chapter_id is null
      or exists (
        select 1 from public.chapters c
        where c.id = chapter_id
          and c.status = 'published'
          and c.moderation_state = 'approved'
      )
    )
  )
  or user_id = (select auth.uid())
  or (select private.is_admin())
);

create or replace function public.admin_set_moderation(
  p_target_type text,
  p_target_id uuid,
  p_state public.moderation_state,
  p_reason text default null,
  p_report_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_action text;
begin
  if v_admin is null or not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_target_type not in ('book','chapter','comment','author') then
    raise exception 'Unsupported moderation target';
  end if;

  v_action := case p_state when 'approved' then 'approve' when 'hidden' then 'hide' else 'reject' end;

  if p_target_type = 'book' then
    update public.books
      set moderation_state = p_state, moderation_note = nullif(btrim(p_reason),''), moderated_at = now(), moderated_by = v_admin
      where id = p_target_id;
  elsif p_target_type = 'chapter' then
    update public.chapters
      set moderation_state = p_state, moderation_note = nullif(btrim(p_reason),''), moderated_at = now(), moderated_by = v_admin
      where id = p_target_id;
  elsif p_target_type = 'comment' then
    update public.comments
      set moderation_state = p_state, moderation_note = nullif(btrim(p_reason),''), moderated_at = now(), moderated_by = v_admin
      where id = p_target_id;
  else
    update public.authors
      set moderation_state = p_state, moderation_note = nullif(btrim(p_reason),''), moderated_at = now(), moderated_by = v_admin
      where id = p_target_id;
  end if;

  if not found then raise exception 'Moderation target not found'; end if;

  insert into public.moderation_actions(admin_id,target_type,target_id,action,reason,report_id)
  values (v_admin,p_target_type,p_target_id,v_action,nullif(btrim(p_reason),''),p_report_id);
end;
$$;

create or replace function public.admin_update_report(
  p_report_id uuid,
  p_status public.report_status,
  p_resolution_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_report public.reports%rowtype;
begin
  if v_admin is null or not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.reports
    set status = p_status,
        assigned_admin_id = v_admin,
        resolution_note = nullif(btrim(p_resolution_note),''),
        updated_at = now()
    where id = p_report_id
    returning * into v_report;

  if not found then raise exception 'Report not found'; end if;

  if p_status in ('resolved','rejected') then
    insert into public.moderation_actions(
      admin_id,target_type,target_id,action,reason,report_id
    )
    values (
      v_admin,
      case
        when v_report.book_id is not null then 'book'
        when v_report.chapter_id is not null then 'chapter'
        when v_report.comment_id is not null then 'comment'
        else 'author'
      end,
      coalesce(v_report.book_id,v_report.chapter_id,v_report.comment_id,v_report.author_id),
      case when p_status = 'resolved' then 'resolve_report' else 'reject_report' end,
      nullif(btrim(p_resolution_note),''),
      p_report_id
    );
  end if;
end;
$$;

revoke all on function public.admin_set_moderation(text,uuid,public.moderation_state,text,uuid) from public;
grant execute on function public.admin_set_moderation(text,uuid,public.moderation_state,text,uuid) to authenticated;
revoke all on function public.admin_update_report(uuid,public.report_status,text) from public;
grant execute on function public.admin_update_report(uuid,public.report_status,text) to authenticated;

grant select, insert on public.reports to authenticated;
grant update on public.reports to authenticated;
grant select on public.moderation_actions to authenticated;

commit;
