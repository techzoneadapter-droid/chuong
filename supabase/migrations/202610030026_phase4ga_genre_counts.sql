-- CHUONG Phase 4G-A: public genre counts for discovery filters
create or replace function public.get_public_genre_counts(
  p_limit integer default 30
)
returns table (
  genre text,
  book_count bigint
)
language sql
security invoker
set search_path = ''
stable
as $$
  select bg.genre, count(distinct b.id)::bigint as book_count
  from public.book_genres bg
  join public.books b on b.id = bg.book_id
  join public.authors a on a.id = b.author_id
  where b.visibility = 'public'
    and b.status <> 'draft'
    and b.moderation_state = 'approved'
    and a.moderation_state = 'approved'
  group by bg.genre
  order by count(distinct b.id) desc, bg.genre asc
  limit greatest(1, least(coalesce(p_limit,30), 100));
$$;

revoke execute on function public.get_public_genre_counts(integer) from public;
grant execute on function public.get_public_genre_counts(integer) to anon, authenticated;
