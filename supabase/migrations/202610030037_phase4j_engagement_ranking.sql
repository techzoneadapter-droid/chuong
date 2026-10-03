-- CHUONG Phase 4J: feed real recent reading engagement into discovery and recommendations
begin;

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
      b.engagement_score,
      b.engagement_updated_at,
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
            2.2 - extract(epoch from (now() - c.updated_at)) / 86400.0 / 14.0
          )
        + greatest(c.engagement_score,0)::double precision
          * exp(
              -greatest(
                0,
                extract(epoch from (now() - coalesce(c.engagement_updated_at,c.updated_at))) / 86400.0
              ) / 7.0
            )
          * 1.35
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

create or replace function public.get_personalized_book_ids(
  p_limit integer default 12
)
returns table (
  book_id uuid,
  score double precision,
  reason_type text,
  reason_label text,
  personalized boolean
)
language sql
security invoker
set search_path = ''
stable
as $$
  with params as (
    select
      (select auth.uid()) as uid,
      greatest(1, least(coalesce(p_limit,12), 30)) as take_rows
  ),
  raw_signals as (
    select rp.book_id, 5.0::double precision as weight
    from public.reading_progress rp, params p
    where p.uid is not null and rp.user_id=p.uid
    union all
    select l.book_id,
      case l.status::text
        when 'favorite' then 8.0
        when 'reading' then 6.0
        when 'completed' then 3.0
        else 3.0
      end::double precision
    from public.library l, params p
    where p.uid is not null and l.user_id=p.uid
    union all
    select bf.book_id, 9.0::double precision
    from public.book_follows bf, params p
    where p.uid is not null and bf.user_id=p.uid
  ),
  book_signal as (
    select book_id, sum(weight)::double precision as weight
    from raw_signals
    group by book_id
  ),
  genre_pref as (
    select bg.genre, sum(bs.weight)::double precision as weight
    from book_signal bs
    join public.book_genres bg on bg.book_id=bs.book_id
    group by bg.genre
  ),
  author_pref_from_books as (
    select b.author_id, sum(bs.weight * 0.8)::double precision as weight
    from book_signal bs
    join public.books b on b.id=bs.book_id
    group by b.author_id
  ),
  author_pref as (
    select author_id, sum(weight)::double precision as weight
    from (
      select ap.author_id, ap.weight
      from author_pref_from_books ap
      union all
      select af.author_id, 14.0::double precision
      from public.author_follows af, params p
      where p.uid is not null and af.user_id=p.uid
    ) s
    group by author_id
  ),
  signal_state as (
    select exists(select 1 from book_signal) or exists(select 1 from author_pref) as has_signals
  ),
  candidates as (
    select
      b.id,
      b.author_id,
      b.views_count,
      b.followers_count,
      b.rating,
      b.updated_at,
      b.engagement_score,
      b.engagement_updated_at,
      a.pen_name,
      coalesce(bs.weight,0)::double precision as seen_weight,
      coalesce(ap.weight,0)::double precision as author_score,
      exists(
        select 1
        from public.author_follows af, params p
        where p.uid is not null
          and af.user_id=p.uid
          and af.author_id=b.author_id
      ) as follows_author,
      coalesce((
        select sum(gp.weight)
        from public.book_genres bg
        join genre_pref gp on gp.genre=bg.genre
        where bg.book_id=b.id
      ),0)::double precision as genre_score,
      (
        select bg.genre
        from public.book_genres bg
        join genre_pref gp on gp.genre=bg.genre
        where bg.book_id=b.id
        order by gp.weight desc, bg.genre
        limit 1
      ) as top_genre
    from public.books b
    join public.authors a on a.id=b.author_id
    left join book_signal bs on bs.book_id=b.id
    left join author_pref ap on ap.author_id=b.author_id
    cross join params p
    where b.visibility='public'
      and b.status <> 'draft'
      and b.moderation_state='approved'
      and a.moderation_state='approved'
      and (
        p.uid is null
        or not exists (
          select 1
          from public.recommendation_feedback rf
          where rf.user_id=p.uid and rf.book_id=b.id
        )
      )
  ),
  scored as (
    select
      c.*,
      s.has_signals,
      (
        c.genre_score * 2.4
        + c.author_score * 1.25
        + case when c.follows_author then 18 else 0 end
        + (
          ln(1 + greatest(c.views_count,0)::double precision) * 0.6
          + ln(1 + greatest(c.followers_count,0)::double precision) * 1.1
          + coalesce(c.rating,0)::double precision * 0.8
          + greatest(
              0,
              2.0 - extract(epoch from (now() - c.updated_at)) / 86400.0 / 14.0
            )
          + greatest(c.engagement_score,0)::double precision
            * exp(
                -greatest(
                  0,
                  extract(epoch from (now() - coalesce(c.engagement_updated_at,c.updated_at))) / 86400.0
                ) / 7.0
              )
            * 0.9
        ) * 0.45
      )::double precision as final_score
    from candidates c
    cross join signal_state s
  )
  select
    s.id as book_id,
    s.final_score as score,
    case
      when s.has_signals and s.follows_author then 'followed_author'
      when s.has_signals and s.top_genre is not null and s.genre_score > 0 then 'favorite_genre'
      when s.has_signals and s.author_score > 0 then 'familiar_author'
      else 'popular'
    end as reason_type,
    case
      when s.has_signals and s.follows_author then s.pen_name
      when s.has_signals and s.top_genre is not null and s.genre_score > 0 then s.top_genre
      when s.has_signals and s.author_score > 0 then s.pen_name
      else 'Nổi bật trên CHƯƠNG'
    end as reason_label,
    s.has_signals as personalized
  from scored s
  order by
    case when s.seen_weight > 0 then 1 else 0 end asc,
    s.final_score desc,
    s.views_count desc,
    s.followers_count desc,
    s.updated_at desc,
    s.id
  limit (select take_rows from params);
$$;

revoke execute on function public.get_personalized_book_ids(integer) from public;
grant execute on function public.get_personalized_book_ids(integer) to anon, authenticated;

commit;
