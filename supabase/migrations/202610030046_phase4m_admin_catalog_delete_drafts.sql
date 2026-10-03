drop policy if exists "admins delete draft books" on public.books;
create policy "admins delete draft books"
on public.books
for delete
to authenticated
using (
  status = 'draft'::public.book_status
  and (select private.is_admin())
);
