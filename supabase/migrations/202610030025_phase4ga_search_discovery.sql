-- CHUONG Phase 4G-A: accent-insensitive public search and real-signal discovery ranking
begin;

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function private.search_normalize(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    lower(extensions.unaccent('extensions.unaccent', coalesce(p_value, ''))),
    '\\s+',
    ' ',
    'g'
  );
$$;

create index if not exists books_title_search_trgm_idx
  on public.books using gin (private.search_normalize(title) extensions.gin_trgm_ops);

create index if not exists authors_pen_name_search_trgm_idx
  on public.authors using gin (private.search_normalize(pen_name) extensions.gin_trgm_ops);

create index if not exists book_genres_genre_search_trgm_idx
  on public.book_genres using gin (private.search_normalize(genre) extensions.gin_trgm_ops);

create index if not exists books_public_discovery_idx
  on public.books (visibility, moderation_state, status, updated_at desc)
  where visibility = 'public' and status <> 'draft' and moderation_state = 'approved';

create or replace function public.search_public_book_ids(
  p_query text default '',
  p_genre text default null,
  p_access text default 'all',
  p_status text default 'all',
  p_sort text default 'relevance',
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  book_id uuid,
  relevance double precision,
  total_count bigint
)
language sql
security invoker
set search_path = ''
stable
as $$
  with params as (
    select
      private.search_normalize(coalesce(p_query, '')) as q,
      nullif(private.search_normalize(coalesce(p_genre, '')), '') as genre_q,
      case when p_access in ('all','free','vip') then p_access else 'all' end as access_filter,
      case when p_status in ('all','ongoing','completed','paused') then p_status else 'all' end as status_filter,
      case when p_sort in ('relevance','popular','newest','rating') then p_sort else 'relevance' end as sort_mode,
      greatest(1, least(coalesce(p_limit,30), 60)) as take_rows,
      greatest(0, coalesce(p_offset,0)) as skip_rows
  ),
  candidates as (
    select
      b.id,
      b.title,
      b.updated_at,
      b.views_count,
      b.followers_count,
      b.rating,
      private.search_normalize(b.title) as title_n,
      private.search_normalize(a.pen_name) as author_n,
      private.search_normalize(
        concat_ws(
          ' ',
          b.title,
          b.description,
          array_to_string(b.tags, ' '),
          a.pen_name,
          coalesce((
            select string_agg(bg.genre, ' ')
            from public.book_genres bg
            where bg.book_id = b.id
          ), '')
        )
      ) as haystack_n
    from public.books b
    join public.authors a on a.id = b.author_id
    cross join params p
    where b.visibility = 'public'
      and b.status <> 'draft'
      and b.moderation_state = 'approved'
      and a.moderation_state = 'approved'
      and (p.status_filter = 'all' or b.status::text = p.status_filter)
      and (
        p.access_filter = 'all'
        or (p.access_filter = 'vip' and b.is_vip = true)
        or (p.access_filter = 'free' and b.is_vip = false)
      )
      and (
        p.genre_q is null
        or exists (
          select 1
          from public.book_genres bg
          where bg.book_id = b.id
            and private.search_normalize(bg.genre) = p.genre_q
        )
      )
  ),
  matched as (
    select
      c.*,
      p.q,
      p.sort_mode,
      p.take_rows,
      p.skip_rows,
      case
        when p.q = '' then 0::double precision
        else (
          case when c.title_n = p.q then 100 else 0 end
          + case when c.title_n like p.q || '%' then 45 else 0 end
          + case when c.title_n like '%' || p.q || '%' then 28 else 0 end
          + case when c.author_n = p.q then 60 else 0 end
          + case when c.author_n like p.q || '%' then 30 else 0 end
          + case when c.author_n like '%' || p.q || '%' then 18 else 0 end
          + greatest(0, extensions.similarity(c.title_n, p.q)) * 20
          + greatest(0, extensions.similarity(c.author_n, p.q)) * 12
          + greatest(0, extensions.similarity(c.haystack_n, p.q)) * 6
        )::double precision
      end as text_score,
      (
        ln(1 + greatest(c.views_count,0)::double precision) * 0.58
        + ln(1 + greatest(c.followers_count,0)::double precision) * 1.12
        + coalesce(c.rating,0)::double precision * 0.85
        + greatest(
            0,
            2.2 - (
              extract(epoch from (now() - c.updated_at)) / 86400.0
            ) / 14.0
          )
      )::double precision as hot_score
    from candidates c
    cross join params p
    where p.q = ''
       or c.title_n like '%' || p.q || '%'
       or c.author_n like '%' || p.q || '%'
       or c.haystack_n like '%' || p.q || '%'
       or extensions.similarity(c.title_n, p.q) >= 0.22
       or extensions.similarity(c.author_n, p.q) >= 0.25
  ),
  ranked as (
    select
      m.*,
      count(*) over() as result_count
    from matched m
  )
  select
    r.id as book_id,
    case
      when r.sort_mode = 'popular' then r.hot_score
      when r.sort_mode = 'rating' then coalesce(r.rating,0)::double precision
      when r.sort_mode = 'newest' then extract(epoch from r.updated_at)::double precision
      else r.text_score + r.hot_score * 0.15
    end as relevance,
    r.result_count as total_count
  from ranked r
  order by
    case when r.sort_mode = 'relevance' then r.text_score + r.hot_score * 0.15 end desc nulls last,
    case when r.sort_mode = 'popular' then r.hot_score end desc nulls last,
    case when r.sort_mode = 'newest' then r.updated_at end desc nulls last,
    case when r.sort_mode = 'rating' then r.rating end desc nulls last,
    r.views_count desc,
    r.updated_at desc,
    r.id
  limit (select take_rows from params)
  offset (select skip_rows from params);
$$;

revoke execute on function public.search_public_book_ids(text,text,text,text,text,integer,integer) from public;
grant execute on function public.search_public_book_ids(text,text,text,text,text,integer,integer) to anon, authenticated;

commit;
