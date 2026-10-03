-- CHUONG Phase 3B security/performance hardening
begin;

-- Admin RPCs no longer bypass RLS. Their table writes are authorized by admin-only policies.
alter function public.admin_set_moderation(text,uuid,public.moderation_state,text,uuid) security invoker;
alter function public.admin_update_report(uuid,public.report_status,text) security invoker;

revoke execute on function public.admin_set_moderation(text,uuid,public.moderation_state,text,uuid) from public, anon;
grant execute on function public.admin_set_moderation(text,uuid,public.moderation_state,text,uuid) to authenticated;

revoke execute on function public.admin_update_report(uuid,public.report_status,text) from public, anon;
grant execute on function public.admin_update_report(uuid,public.report_status,text) to authenticated;

-- Admins may update moderation targets; ownership checks remain for ordinary users.
alter policy "authors update own profile" on public.authors
using ((select auth.uid()) = user_id or (select private.is_admin()))
with check ((select auth.uid()) = user_id or (select private.is_admin()));

alter policy "authors update own books" on public.books
using (
  exists (
    select 1 from public.authors a
    where a.id = author_id and a.user_id = (select auth.uid())
  )
  or (select private.is_admin())
)
with check (
  exists (
    select 1 from public.authors a
    where a.id = author_id and a.user_id = (select auth.uid())
  )
  or (select private.is_admin())
);

alter policy "authors update chapters for own books" on public.chapters
using (
  exists (
    select 1 from public.books b
    join public.authors a on a.id = b.author_id
    where b.id = book_id and a.user_id = (select auth.uid())
  )
  or (select private.is_admin())
)
with check (
  exists (
    select 1 from public.books b
    join public.authors a on a.id = b.author_id
    where b.id = book_id and a.user_id = (select auth.uid())
  )
  or (select private.is_admin())
);

alter policy "users update own comments" on public.comments
using ((select auth.uid()) = user_id or (select private.is_admin()))
with check ((select auth.uid()) = user_id or (select private.is_admin()));

drop policy if exists "admins insert moderation actions" on public.moderation_actions;
create policy "admins insert moderation actions" on public.moderation_actions
for insert to authenticated
with check ((select private.is_admin()) and admin_id = (select auth.uid()));

grant insert on public.moderation_actions to authenticated;

-- Foreign-key covering indexes for moderation metadata.
create index if not exists authors_moderated_by_idx on public.authors (moderated_by) where moderated_by is not null;
create index if not exists books_moderated_by_idx on public.books (moderated_by) where moderated_by is not null;
create index if not exists chapters_moderated_by_idx on public.chapters (moderated_by) where moderated_by is not null;
create index if not exists comments_moderated_by_idx on public.comments (moderated_by) where moderated_by is not null;
create index if not exists moderation_actions_report_idx on public.moderation_actions (report_id) where report_id is not null;

commit;
