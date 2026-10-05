-- Phase 4R2: derived reader updates; no content, entitlements, or notification writes.
begin;

-- Existing follow/progress primary keys already start with user_id.
-- Cover the published metadata scan without reading chapter bodies.
create index if not exists chapters_followed_updates_idx
  on public.chapters (book_id, chapter_number)
  include (title, published_at)
  where status = 'published' and moderation_state = 'approved';

create or replace function public.get_my_followed_book_updates(
  p_limit integer default 20,
  p_offset integer default 0,
  p_updates_only boolean default false
)
returns table (
  book_id uuid, title text, cover_url text, author_id uuid, author_name text,
  current_chapter_number integer, next_chapter_number integer,
  latest_chapter_number integer, latest_chapter_title text,
  latest_published_at timestamptz, last_update_at timestamptz,
  published_count bigint, unread_count bigint, has_updates boolean
)
language sql stable security invoker set search_path = ''
as $$
  select b.id, b.title, b.cover_url, a.id, a.pen_name,
    p.chapter_number, stats.next_number, latest.chapter_number, latest.title,
    latest.published_at, stats.last_update_at,
    stats.published_count, stats.unread_count, stats.unread_count > 0
  from public.book_follows f
  join public.books b on b.id = f.book_id
  join public.authors a on a.id = b.author_id
  left join public.reading_progress p
    on p.book_id = f.book_id and p.user_id = (select auth.uid())
  cross join lateral (
    select count(*) as published_count,
      count(*) filter (where c.chapter_number > coalesce(p.chapter_number, 0)) as unread_count,
      min(c.chapter_number) filter (where c.chapter_number > coalesce(p.chapter_number, 0)) as next_number,
      max(c.published_at) as last_update_at
    from public.chapters c
    where c.book_id = b.id and c.status = 'published' and c.moderation_state = 'approved'
  ) stats
  left join lateral (
    select c.chapter_number, c.title, c.published_at
    from public.chapters c
    where c.book_id = b.id and c.status = 'published' and c.moderation_state = 'approved'
    order by c.chapter_number desc limit 1
  ) latest on true
  where f.user_id = (select auth.uid())
    and b.visibility = 'public' and b.status <> 'draft'
    and b.moderation_state = 'approved' and a.moderation_state = 'approved'
    and (not coalesce(p_updates_only, false) or stats.unread_count > 0)
  order by (stats.unread_count > 0) desc, stats.last_update_at desc nulls last, b.id
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.get_my_followed_book_update_badge()
returns table (updated_books bigint, unread_chapters bigint)
language sql stable security invoker set search_path = ''
as $$
  select count(*) filter (where ahead.n > 0), coalesce(sum(ahead.n), 0)::bigint
  from public.book_follows f
  join public.books b on b.id = f.book_id
  join public.authors a on a.id = b.author_id
  left join public.reading_progress p
    on p.book_id = f.book_id and p.user_id = (select auth.uid())
  cross join lateral (
    select count(*) as n from public.chapters c
    where c.book_id = b.id and c.status = 'published' and c.moderation_state = 'approved'
      and c.chapter_number > coalesce(p.chapter_number, 0)
  ) ahead
  where f.user_id = (select auth.uid())
    and b.visibility = 'public' and b.status <> 'draft'
    and b.moderation_state = 'approved' and a.moderation_state = 'approved';
$$;

revoke all on function public.get_my_followed_book_updates(integer,integer,boolean) from public, anon;
revoke all on function public.get_my_followed_book_update_badge() from public, anon;
grant execute on function public.get_my_followed_book_updates(integer,integer,boolean) to authenticated;
grant execute on function public.get_my_followed_book_update_badge() to authenticated;
commit;
