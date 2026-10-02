-- Additive fixes: retain the published foundation migration.
begin;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 80))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Repair missing profiles without allowing users to select elevated roles.
create policy "users recover own reader profile" on public.profiles for insert to authenticated
with check (id = auth.uid() and role = 'reader');

create or replace function public.promote_new_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = 'author' where id = new.user_id and role = 'reader';
  return new;
end;
$$;
create trigger authors_promote_profile after insert on public.authors
for each row execute function public.promote_new_author();
-- Complete author rows left by an interrupted pre-trigger onboarding.
update public.profiles p set role = 'author'
where p.role = 'reader' and exists (select 1 from public.authors a where a.user_id = p.id);

-- Metrics/verification must not be supplied on INSERT either.
create or replace function public.initialize_metrics() returns trigger language plpgsql as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    new.followers_count = 0;
    if tg_table_name = 'authors' then new.verified = false;
    else new.rating = 0; new.views_count = 0; new.total_chapters = 0;
    end if;
  end if;
  return new;
end;
$$;
create trigger authors_initialize_metrics before insert on public.authors for each row execute function public.initialize_metrics();
create trigger books_initialize_metrics before insert on public.books for each row execute function public.initialize_metrics();

create or replace function public.validate_chapter_publication() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.book_id <> old.book_id then
    raise exception 'chapter book cannot be changed';
  end if;
  if new.status = 'published' then
    if char_length(trim(new.title)) < 2 or char_length(trim(new.content)) < 50 then
      raise exception 'published chapter requires title and at least 50 characters';
    end if;
    if tg_op = 'INSERT' then new.published_at = now();
    elsif old.status <> 'published' then new.published_at = now();
    else new.published_at = coalesce(old.published_at, now());
    end if;
  else new.published_at = null;
  end if;
  return new;
end;
$$;
create trigger chapters_validate_publication before insert or update on public.chapters
for each row execute function public.validate_chapter_publication();

-- Atomic deltas serialize on the parent row; SELECT count(*) can lose concurrent updates.
create or replace function public.refresh_book_chapter_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare delta integer; target_book uuid;
begin
  if tg_op = 'INSERT' then delta := case when new.status = 'published' then 1 else 0 end; target_book := new.book_id;
  elsif tg_op = 'DELETE' then delta := case when old.status = 'published' then -1 else 0 end; target_book := old.book_id;
  else delta := (case when new.status = 'published' then 1 else 0 end) - (case when old.status = 'published' then 1 else 0 end); target_book := new.book_id;
  end if;
  if delta <> 0 then update public.books set total_chapters = greatest(0, total_chapters + delta) where id = target_book; end if;
  return null;
end;
$$;
create or replace function public.refresh_follow_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare delta integer;
begin
  delta := case when tg_op = 'DELETE' then -1 else 1 end;
  if tg_table_name = 'author_follows' then
    update public.authors set followers_count = greatest(0, followers_count + delta)
    where id = case when tg_op = 'DELETE' then old.author_id else new.author_id end;
  else
    update public.books set followers_count = greatest(0, followers_count + delta)
    where id = case when tg_op = 'DELETE' then old.book_id else new.book_id end;
  end if;
  return null;
end;
$$;

-- Repair any invalid publication left by the earlier foundation before enforcing the invariant.
update public.chapters set status = 'draft'
where status = 'published' and (char_length(trim(title)) < 2 or char_length(trim(content)) < 50);
update public.chapters set published_at = now() where status = 'published' and published_at is null;
alter table public.chapters add constraint chapters_valid_publication check (
  (status = 'draft' and published_at is null) or
  (status = 'published' and published_at is not null and char_length(trim(title)) >= 2 and char_length(trim(content)) >= 50)
);

-- Reconcile old counters once. ALTER TABLE locks serialize this maintenance; RLS stays enabled.
alter table public.books disable trigger books_protect_metrics;
update public.books b set
  total_chapters = (select count(*) from public.chapters c where c.book_id = b.id and c.status = 'published'),
  followers_count = (select count(*) from public.book_follows f where f.book_id = b.id)
where b.total_chapters <> (select count(*) from public.chapters c where c.book_id = b.id and c.status = 'published')
   or b.followers_count <> (select count(*) from public.book_follows f where f.book_id = b.id);
alter table public.books enable trigger books_protect_metrics;
alter table public.authors disable trigger authors_protect_metrics;
update public.authors a set followers_count = (select count(*) from public.author_follows f where f.author_id = a.id)
where a.followers_count <> (select count(*) from public.author_follows f where f.author_id = a.id);
alter table public.authors enable trigger authors_protect_metrics;

-- Validate references with caller's RLS permissions, including replies to the same book/chapter.
create or replace function public.validate_reading_reference() returns trigger language plpgsql as $$
begin
  if new.chapter_id is not null and not exists (
    select 1 from public.chapters c where c.id = new.chapter_id and c.book_id = new.book_id
    and c.chapter_number = new.chapter_number and c.status = 'published'
  ) then raise exception 'invalid reading chapter'; end if;
  return new;
end;
$$;
create trigger progress_validate_reference before insert or update on public.reading_progress for each row execute function public.validate_reading_reference();
create trigger bookmarks_validate_reference before insert or update on public.bookmarks for each row execute function public.validate_reading_reference();

create or replace function public.validate_comment_reference() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.books b where b.id = new.book_id and b.visibility = 'public' and b.status <> 'draft') then
    raise exception 'comments require public book';
  end if;
  if new.chapter_id is not null and not exists (select 1 from public.chapters c where c.id = new.chapter_id and c.book_id = new.book_id and c.status = 'published') then
    raise exception 'comments require published chapter';
  end if;
  if new.parent_id is not null and not exists (select 1 from public.comments c where c.id = new.parent_id and c.book_id = new.book_id and c.chapter_id is not distinct from new.chapter_id and c.parent_id is null) then
    raise exception 'invalid comment parent';
  end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.book_id <> old.book_id or new.chapter_id is distinct from old.chapter_id or new.parent_id is distinct from old.parent_id) then
    raise exception 'comment identity cannot be changed';
  end if;
  return new;
end;
$$;
create trigger comments_validate_reference before insert or update on public.comments for each row execute function public.validate_comment_reference();
drop policy "comments on public books are readable" on public.comments;
create policy "comments on public books are readable" on public.comments for select using (
  exists (select 1 from public.books b where b.id = book_id and b.visibility = 'public' and b.status <> 'draft')
  and (chapter_id is null or exists (select 1 from public.chapters c where c.id = chapter_id and c.status = 'published'))
);
drop policy "users add own comment likes" on public.comment_likes;
create policy "users add own comment likes" on public.comment_likes for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from public.comments c where c.id = comment_id)
);
drop policy "comment likes are readable" on public.comment_likes;
create policy "comment likes are readable" on public.comment_likes for select using (exists (select 1 from public.comments c where c.id = comment_id));

-- Limit destructive deletes to drafts, in addition to ownership.
drop policy "authors delete own books" on public.books;
create policy "authors delete own books" on public.books for delete to authenticated using (
  status = 'draft' and exists (select 1 from public.authors a where a.id = author_id and a.user_id = auth.uid())
);
drop policy "authors delete chapters for own books" on public.chapters;
create policy "authors delete chapters for own books" on public.chapters for delete to authenticated using (
  status = 'draft' and exists (select 1 from public.books b join public.authors a on a.id = b.author_id where b.id = book_id and a.user_id = auth.uid())
);

-- Covers now use userId/bookId/unique-file.ext. Existing URLs remain publicly readable.
drop policy "authors upload own covers" on storage.objects;
drop policy "authors update own covers" on storage.objects;
drop policy "authors delete own covers" on storage.objects;
create policy "authors upload own covers" on storage.objects for insert to authenticated with check (
  bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.books b join public.authors a on a.id = b.author_id
    where b.id::text = (storage.foldername(name))[2] and a.user_id = auth.uid())
);
create policy "authors delete own covers" on storage.objects for delete to authenticated using (
  bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text
);
-- Owner may clean up files even after deleting a book. Upload still requires an owned book.

create index comments_parent_idx on public.comments (parent_id);
create index comment_likes_comment_idx on public.comment_likes (comment_id);
create index books_title_search_idx on public.books using gin (to_tsvector('simple', title || ' ' || description));

-- Trigger functions are not callable client RPCs.
revoke execute on function public.handle_new_user(), public.promote_new_author(), public.initialize_metrics(), public.validate_chapter_publication(), public.refresh_book_chapter_count(), public.refresh_follow_count(), public.validate_reading_reference(), public.validate_comment_reference(), public.protect_profile_role(), public.protect_author_metrics(), public.protect_book_metrics() from public, anon, authenticated;
commit;
