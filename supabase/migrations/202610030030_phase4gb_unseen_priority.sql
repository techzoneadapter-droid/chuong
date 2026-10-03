-- CHUONG Phase 4G-B: prefer unseen books before already-read/library/followed books
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
