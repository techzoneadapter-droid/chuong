-- CHUONG Phase 4J: PostgreSQL UUID aggregate compatibility fix
begin;

create or replace function private.refresh_engagement_rollups(
  p_from date default ((timezone('UTC', now()))::date - 1),
  p_to date default ((timezone('UTC', now()))::date)
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from date := least(coalesce(p_from,(timezone('UTC', now()))::date - 1), coalesce(p_to,(timezone('UTC', now()))::date));
  v_to date := greatest(coalesce(p_from,(timezone('UTC', now()))::date - 1), coalesce(p_to,(timezone('UTC', now()))::date));
begin
  if v_to - v_from > 31 then
    raise exception 'ROLLUP_RANGE_TOO_LARGE';
  end if;

  delete from public.book_engagement_daily
  where metric_date between v_from and v_to;

  insert into public.book_engagement_daily(
    metric_date,book_id,unique_readers,new_readers,returning_readers,
    sessions,chapter_starts,chapter_completions,active_seconds,updated_at
  )
  with reader_stats as (
    select
      d.metric_date,
      d.book_id,
      count(*)::bigint as unique_readers,
      count(*) filter (
        where not exists (
          select 1 from public.reader_book_days prior
          where prior.book_id=d.book_id
            and prior.actor_hash=d.actor_hash
            and prior.metric_date < d.metric_date
        )
      )::bigint as new_readers,
      count(*) filter (
        where exists (
          select 1 from public.reader_book_days prior
          where prior.book_id=d.book_id
            and prior.actor_hash=d.actor_hash
            and prior.metric_date < d.metric_date
        )
      )::bigint as returning_readers
    from public.reader_book_days d
    where d.metric_date between v_from and v_to
    group by d.metric_date,d.book_id
  ),
  session_stats as (
    select
      s.started_date as metric_date,
      s.book_id,
      count(*)::bigint as sessions,
      count(*)::bigint as chapter_starts,
      count(*) filter (where s.completed)::bigint as chapter_completions,
      coalesce(sum(s.active_seconds),0)::bigint as active_seconds
    from public.reader_engagement_sessions s
    where s.started_date between v_from and v_to
    group by s.started_date,s.book_id
  ),
  keys as (
    select metric_date,book_id from reader_stats
    union
    select metric_date,book_id from session_stats
  )
  select
    k.metric_date,
    k.book_id,
    coalesce(r.unique_readers,0),
    coalesce(r.new_readers,0),
    coalesce(r.returning_readers,0),
    coalesce(s.sessions,0),
    coalesce(s.chapter_starts,0),
    coalesce(s.chapter_completions,0),
    coalesce(s.active_seconds,0),
    now()
  from keys k
  left join reader_stats r using(metric_date,book_id)
  left join session_stats s using(metric_date,book_id);

  delete from public.chapter_engagement_daily
  where metric_date between v_from and v_to;

  insert into public.chapter_engagement_daily(
    metric_date,chapter_id,book_id,chapter_number,
    unique_readers,sessions,completions,active_seconds,updated_at
  )
  with reader_stats as (
    select
      d.metric_date,
      d.chapter_id,
      min(d.book_id::text)::uuid as book_id,
      max(d.chapter_number) as chapter_number,
      count(*)::bigint as unique_readers
    from public.reader_chapter_days d
    where d.metric_date between v_from and v_to
    group by d.metric_date,d.chapter_id
  ),
  session_stats as (
    select
      s.started_date as metric_date,
      s.chapter_id,
      min(s.book_id::text)::uuid as book_id,
      max(s.chapter_number) as chapter_number,
      count(*)::bigint as sessions,
      count(*) filter (where s.completed)::bigint as completions,
      coalesce(sum(s.active_seconds),0)::bigint as active_seconds
    from public.reader_engagement_sessions s
    where s.started_date between v_from and v_to
    group by s.started_date,s.chapter_id
  ),
  keys as (
    select metric_date,chapter_id from reader_stats
    union
    select metric_date,chapter_id from session_stats
  )
  select
    k.metric_date,
    k.chapter_id,
    coalesce(r.book_id,s.book_id),
    coalesce(r.chapter_number,s.chapter_number),
    coalesce(r.unique_readers,0),
    coalesce(s.sessions,0),
    coalesce(s.completions,0),
    coalesce(s.active_seconds,0),
    now()
  from keys k
  left join reader_stats r using(metric_date,chapter_id)
  left join session_stats s using(metric_date,chapter_id);

  perform set_config('app.analytics_rollup','1',true);

  update public.books b
  set views_count=coalesce((
        select sum(d.unique_readers)
        from public.book_engagement_daily d
        where d.book_id=b.id
      ),0),
      engagement_score=coalesce((
        select
          ln(1 + coalesce(sum(d.unique_readers),0)::double precision) * 2.8
          + ln(1 + coalesce(sum(d.sessions),0)::double precision) * 1.3
          + ln(1 + coalesce(sum(d.chapter_completions),0)::double precision) * 1.8
          + least(coalesce(sum(d.active_seconds),0)::double precision / 3600.0, 100.0) * 0.05
          + case
              when coalesce(sum(d.unique_readers),0) > 0
                then coalesce(sum(d.returning_readers),0)::double precision
                     / greatest(1,coalesce(sum(d.unique_readers),0)) * 2.0
              else 0
            end
        from public.book_engagement_daily d
        where d.book_id=b.id
          and d.metric_date >= (timezone('UTC', now()))::date - 6
      ),0),
      engagement_updated_at=now()
  where exists (
    select 1
    from public.reader_book_days d
    where d.book_id=b.id
      and d.metric_date between v_from and v_to
  );
end;
$$;

revoke all on function private.refresh_engagement_rollups(date,date) from public, anon, authenticated;

commit;
