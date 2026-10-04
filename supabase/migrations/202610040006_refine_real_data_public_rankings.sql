-- CHUONG: make public ranking labels reflect only collected first-party signals.
-- trending = rolling 7d engagement; hot = last 2d acceleration; new = first publish;
-- updated = last published chapter; top = all-time first-party performance.
begin;

create or replace function public.get_public_book_rankings(
  p_kind text default 'trending',
  p_limit integer default 12
)
returns table (
  book_id uuid,
  rank_no integer,
  score double precision,
  unique_readers_7d bigint,
  sessions_7d bigint,
  returning_readers_7d bigint,
  completions_7d bigint,
  active_seconds_7d bigint,
  recent_follows_7d bigint,
  views_count bigint,
  followers_count bigint,
  rating numeric,
  rating_count bigint,
  released_at timestamptz,
  last_chapter_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  with params as (
    select
      case when p_kind in ('trending','hot','new','top','updated') then p_kind else 'trending' end as kind,
      greatest(1, least(coalesce(p_limit,12),50)) as take_rows,
      (timezone('UTC',now()))::date as today
  ),
  public_books as (
    select b.*
    from public.books b
    join public.authors a on a.id=b.author_id
    where b.visibility='public'
      and b.status <> 'draft'
      and b.moderation_state='approved'
      and a.moderation_state='approved'
  ),
  engagement_7d as (
    select
      d.book_id,
      coalesce(sum(d.unique_readers),0)::bigint as unique_readers_7d,
      coalesce(sum(d.new_readers),0)::bigint as new_readers_7d,
      coalesce(sum(d.returning_readers),0)::bigint as returning_readers_7d,
      coalesce(sum(d.sessions),0)::bigint as sessions_7d,
      coalesce(sum(d.chapter_completions),0)::bigint as completions_7d,
      coalesce(sum(d.active_seconds),0)::bigint as active_seconds_7d,
      coalesce(sum((
        d.unique_readers*4.0
        + d.new_readers*2.25
        + d.returning_readers*4.5
        + d.sessions*1.25
        + d.chapter_completions*2.1
        + least(d.active_seconds::double precision/60.0,300.0)*0.05
      ) * power(0.82,greatest(0,(select today from params)-d.metric_date))),0)::double precision as trend_score
    from public.book_engagement_daily d
    where d.metric_date >= (select today from params)-6
    group by d.book_id
  ),
  engagement_2d as (
    select
      d.book_id,
      coalesce(sum(d.unique_readers),0)::bigint as unique_readers_2d,
      coalesce(sum(d.new_readers),0)::bigint as new_readers_2d,
      coalesce(sum(d.returning_readers),0)::bigint as returning_readers_2d,
      coalesce(sum(d.sessions),0)::bigint as sessions_2d,
      coalesce(sum(d.chapter_completions),0)::bigint as completions_2d,
      coalesce(sum(d.active_seconds),0)::bigint as active_seconds_2d,
      coalesce(sum(
        d.unique_readers*5.0
        + d.new_readers*3.0
        + d.returning_readers*5.5
        + d.sessions*1.5
        + d.chapter_completions*2.4
        + least(d.active_seconds::double precision/60.0,240.0)*0.06
      ),0)::double precision as hot_score_2d
    from public.book_engagement_daily d
    where d.metric_date >= (select today from params)-1
    group by d.book_id
  ),
  lifetime as (
    select d.book_id,
      coalesce(sum(d.unique_readers),0)::bigint as all_unique_reader_days,
      coalesce(sum(d.returning_readers),0)::bigint as all_returning_reader_days,
      coalesce(sum(d.sessions),0)::bigint as all_sessions,
      coalesce(sum(d.chapter_completions),0)::bigint as all_completions,
      coalesce(sum(d.active_seconds),0)::bigint as all_active_seconds
    from public.book_engagement_daily d
    group by d.book_id
  ),
  releases as (
    select c.book_id,
      min(c.published_at) filter(where c.published_at is not null) as released_at,
      max(c.published_at) filter(where c.published_at is not null) as last_chapter_at
    from public.chapters c
    where c.status='published' and c.moderation_state='approved'
    group by c.book_id
  ),
  follows as (
    select f.book_id,
      count(*) filter(where f.created_at>=now()-interval '7 days')::bigint as recent_follows_7d,
      count(*) filter(where f.created_at>=now()-interval '2 days')::bigint as recent_follows_2d
    from public.book_follows f
    group by f.book_id
  ),
  rating_base as (
    select coalesce(
      sum(b.rating*b.rating_count)::numeric/nullif(sum(b.rating_count),0),
      0::numeric
    ) as global_rating
    from public_books b
    where b.rating_count>0
  ),
  signals as (
    select
      b.id as book_id,
      coalesce(e7.unique_readers_7d,0)::bigint as unique_readers_7d,
      coalesce(e7.new_readers_7d,0)::bigint as new_readers_7d,
      coalesce(e7.returning_readers_7d,0)::bigint as returning_readers_7d,
      coalesce(e7.sessions_7d,0)::bigint as sessions_7d,
      coalesce(e7.completions_7d,0)::bigint as completions_7d,
      coalesce(e7.active_seconds_7d,0)::bigint as active_seconds_7d,
      coalesce(e7.trend_score,0)::double precision as trend_score,
      coalesce(e2.unique_readers_2d,0)::bigint as unique_readers_2d,
      coalesce(e2.new_readers_2d,0)::bigint as new_readers_2d,
      coalesce(e2.returning_readers_2d,0)::bigint as returning_readers_2d,
      coalesce(e2.sessions_2d,0)::bigint as sessions_2d,
      coalesce(e2.completions_2d,0)::bigint as completions_2d,
      coalesce(e2.active_seconds_2d,0)::bigint as active_seconds_2d,
      coalesce(e2.hot_score_2d,0)::double precision as hot_score_2d,
      coalesce(f.recent_follows_7d,0)::bigint as recent_follows_7d,
      coalesce(f.recent_follows_2d,0)::bigint as recent_follows_2d,
      greatest(b.views_count,0)::bigint as views_count,
      greatest(b.followers_count,0)::bigint as followers_count,
      coalesce(b.rating,0)::numeric as rating,
      greatest(b.rating_count,0)::bigint as rating_count,
      coalesce(r.released_at,b.created_at) as released_at,
      coalesce(r.last_chapter_at,r.released_at,b.updated_at) as last_chapter_at,
      coalesce(l.all_unique_reader_days,0)::bigint as all_unique_reader_days,
      coalesce(l.all_returning_reader_days,0)::bigint as all_returning_reader_days,
      coalesce(l.all_sessions,0)::bigint as all_sessions,
      coalesce(l.all_completions,0)::bigint as all_completions,
      coalesce(l.all_active_seconds,0)::bigint as all_active_seconds,
      (
        (greatest(b.rating_count,0)::double precision/(greatest(b.rating_count,0)+5.0))*coalesce(b.rating,0)::double precision
        +(5.0/(greatest(b.rating_count,0)+5.0))*coalesce((select global_rating from rating_base),0)::double precision
      ) as bayes_rating
    from public_books b
    left join engagement_7d e7 on e7.book_id=b.id
    left join engagement_2d e2 on e2.book_id=b.id
    left join lifetime l on l.book_id=b.id
    left join releases r on r.book_id=b.id
    left join follows f on f.book_id=b.id
  ),
  scored as (
    select s.*,p.kind,
      case
        when p.kind='trending' then s.trend_score
        when p.kind='hot' then
          s.hot_score_2d
          + ln(1+s.recent_follows_2d::double precision)*6.0
          + greatest(0,1.0-extract(epoch from(now()-s.last_chapter_at))/86400.0/3.0)
        when p.kind='new' then extract(epoch from s.released_at)::double precision
        when p.kind='updated' then extract(epoch from s.last_chapter_at)::double precision
        else
          ln(1+s.views_count::double precision)*3.0
          + ln(1+s.followers_count::double precision)*4.5
          + ln(1+s.all_unique_reader_days::double precision)*3.5
          + ln(1+s.all_returning_reader_days::double precision)*3.0
          + ln(1+s.all_sessions::double precision)*1.4
          + ln(1+s.all_completions::double precision)*2.4
          + ln(1+s.all_active_seconds::double precision/60.0)*0.55
          + s.bayes_rating*1.35
      end::double precision as final_score
    from signals s cross join params p
  ),
  eligible as (
    select * from scored
    where
      (kind<>'trending' or (unique_readers_7d+sessions_7d+completions_7d+active_seconds_7d)>0)
      and (kind<>'hot' or (unique_readers_2d+sessions_2d+completions_2d+active_seconds_2d+recent_follows_2d)>0)
  ),
  ranked as (
    select e.*,
      row_number() over(order by
        e.final_score desc,
        case when e.kind='hot' then e.unique_readers_2d else e.unique_readers_7d end desc,
        e.views_count desc,
        e.followers_count desc,
        e.last_chapter_at desc,
        e.book_id
      )::integer as rank_no
    from eligible e
  )
  select
    r.book_id,r.rank_no,r.final_score,
    r.unique_readers_7d,r.sessions_7d,r.returning_readers_7d,r.completions_7d,r.active_seconds_7d,
    r.recent_follows_7d,r.views_count,r.followers_count,r.rating,r.rating_count,r.released_at,r.last_chapter_at
  from ranked r
  order by r.rank_no
  limit (select take_rows from params);
$$;

revoke execute on function public.get_public_book_rankings(text,integer) from public;
grant execute on function public.get_public_book_rankings(text,integer) to anon, authenticated;

commit;