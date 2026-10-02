-- CHUONG Phase 3A scale hardening
-- Optimizes RLS execution plans and common foreign-key lookups without changing permissions.
begin;

-- Lock function search_path to remove mutable search_path security warnings.
alter function public.set_updated_at() set search_path = public;
alter function public.initialize_metrics() set search_path = public;
alter function public.validate_chapter_publication() set search_path = public;
alter function public.validate_reading_reference() set search_path = public;
alter function public.validate_comment_reference() set search_path = public;

-- Foreign-key / ownership indexes used by joins, cascades and RLS.
create index if not exists bookmarks_book_id_idx on public.bookmarks (book_id);
create index if not exists bookmarks_chapter_id_idx on public.bookmarks (chapter_id);
create index if not exists comments_user_id_idx on public.comments (user_id);
create index if not exists downloads_book_id_idx on public.downloads (book_id);
create index if not exists downloads_chapter_id_idx on public.downloads (chapter_id);
create index if not exists library_book_id_idx on public.library (book_id);
create index if not exists reading_progress_book_id_idx on public.reading_progress (book_id);
create index if not exists reading_progress_chapter_id_idx on public.reading_progress (chapter_id);

-- Cache auth.uid() once per statement instead of evaluating it per candidate row.
alter policy "users update own profile" on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy "users recover own reader profile" on public.profiles
  with check (id = (select auth.uid()) and role = 'reader');

alter policy "users create own author profile" on public.authors
  with check ((select auth.uid()) = user_id);

alter policy "authors update own profile" on public.authors
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "public or owned books are readable" on public.books
  using (
    (visibility = 'public' and status <> 'draft')
    or exists (
      select 1 from public.authors a
      where a.id = author_id and a.user_id = (select auth.uid())
    )
  );

alter policy "authors create own books" on public.books
  with check (
    exists (
      select 1 from public.authors a
      where a.id = author_id and a.user_id = (select auth.uid())
    )
  );

alter policy "authors update own books" on public.books
  using (
    exists (
      select 1 from public.authors a
      where a.id = author_id and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.authors a
      where a.id = author_id and a.user_id = (select auth.uid())
    )
  );

alter policy "authors delete own books" on public.books
  using (
    status = 'draft'
    and exists (
      select 1 from public.authors a
      where a.id = author_id and a.user_id = (select auth.uid())
    )
  );

alter policy "genres follow book visibility" on public.book_genres
  using (
    exists (
      select 1
      from public.books b
      where b.id = book_id
        and (
          (b.visibility = 'public' and b.status <> 'draft')
          or exists (
            select 1 from public.authors a
            where a.id = b.author_id and a.user_id = (select auth.uid())
          )
        )
    )
  );

-- Split the previous FOR ALL author genre policy so SELECT has only one permissive policy.
drop policy if exists "authors manage own genres" on public.book_genres;
create policy "authors insert own genres" on public.book_genres
  for insert to authenticated
  with check (
    exists (
      select 1 from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_id and a.user_id = (select auth.uid())
    )
  );
create policy "authors update own genres" on public.book_genres
  for update to authenticated
  using (
    exists (
      select 1 from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_id and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_id and a.user_id = (select auth.uid())
    )
  );
create policy "authors delete own genres" on public.book_genres
  for delete to authenticated
  using (
    exists (
      select 1 from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_id and a.user_id = (select auth.uid())
    )
  );

alter policy "published or owned chapters are readable" on public.chapters
  using (
    (
      status = 'published'
      and exists (
        select 1 from public.books b
        where b.id = book_id and b.visibility = 'public' and b.status <> 'draft'
      )
    )
    or exists (
      select 1 from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_id and a.user_id = (select auth.uid())
    )
  );

alter policy "authors create chapters for own books" on public.chapters
  with check (
    exists (
      select 1 from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_id and a.user_id = (select auth.uid())
    )
  );

alter policy "authors update chapters for own books" on public.chapters
  using (
    exists (
      select 1 from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_id and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_id and a.user_id = (select auth.uid())
    )
  );

alter policy "authors delete chapters for own books" on public.chapters
  using (
    status = 'draft'
    and exists (
      select 1 from public.books b
      join public.authors a on a.id = b.author_id
      where b.id = book_id and a.user_id = (select auth.uid())
    )
  );

alter policy "users manage own library" on public.library
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "users manage own progress" on public.reading_progress
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "users manage own bookmarks" on public.bookmarks
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "users manage own author follows" on public.author_follows
  with check ((select auth.uid()) = user_id);

alter policy "users delete own author follows" on public.author_follows
  using ((select auth.uid()) = user_id);

alter policy "users manage own book follows" on public.book_follows
  with check ((select auth.uid()) = user_id);

alter policy "users delete own book follows" on public.book_follows
  using ((select auth.uid()) = user_id);

alter policy "users create comments as themselves" on public.comments
  with check ((select auth.uid()) = user_id);

alter policy "users update own comments" on public.comments
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "users delete own comments" on public.comments
  using ((select auth.uid()) = user_id);

alter policy "users add own comment likes" on public.comment_likes
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.comments c where c.id = comment_id)
  );

alter policy "users delete own comment likes" on public.comment_likes
  using ((select auth.uid()) = user_id);

alter policy "users manage own downloads" on public.downloads
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;
