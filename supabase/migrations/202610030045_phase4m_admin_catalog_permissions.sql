drop policy if exists "admins create books" on public.books;
create policy "admins create books"
on public.books
for insert
to authenticated
with check ((select private.is_admin()));

drop policy if exists "admins create chapters" on public.chapters;
create policy "admins create chapters"
on public.chapters
for insert
to authenticated
with check ((select private.is_admin()));

drop policy if exists "admins delete draft chapters" on public.chapters;
create policy "admins delete draft chapters"
on public.chapters
for delete
to authenticated
using (
  status = 'draft'::public.chapter_status
  and (select private.is_admin())
);

drop policy if exists "admins manage book genres" on public.book_genres;
create policy "admins manage book genres"
on public.book_genres
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "admins upload catalog covers" on storage.objects;
create policy "admins upload catalog covers"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_admin())
  and exists (
    select 1
    from public.books b
    where b.id::text = (storage.foldername(name))[2]
  )
);
