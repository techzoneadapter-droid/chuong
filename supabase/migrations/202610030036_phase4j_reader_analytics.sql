-- CHUONG Phase 4J: scalable reader engagement analytics, anti-spam views and author aggregates
begin;

alter table public.books
  add column if not exists engagement_score numeric(12,4) not null default 0,
  add column if not exists engagement_updated_at timestamptz;

-- Book freshness should reflect editorial/chapter publication changes, not analytics/follower/rating churn.
create or replace function public.set_book_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.author_id is distinct from old.author_id
     or new.title is distinct from old.title
     or new.slug is distinct from old.slug
     or new.description is distinct from old.description
     or new.cover_url is distinct from old.cover_url
     or new.language is distinct from old.language
     or new.source_type is distinct from old.source_type
     or new.status is distinct from old.status
     or new.visibility is distinct from old.visibility
     or new.is_vip is distinct from old.is_vip
     or new.price_coins is distinct from old.price_coins
     or new.tags is distinct from old.tags
     or new.total_chapters is distinct from old.total_chapters then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists books_updated_at on public.books;
create trigger books_updated_at
before update on public.books
for each row execute function public.set_book_updated_at();

create or replace function public.protect_book_metrics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role'
     and coalesce(current_setting('app.analytics_rollup', true), '') <> '1'
     and pg_trigger_depth() = 1 then
    new.rating = old.rating;
    new.rating_count = old.rating_count;
    new.views_count = old.views_count;
    new.followers_count = old.followers_count;
    new.total_chapters = old.total_chapters;
    new.engagement_score = old.engagement_score;
    new.engagement_updated_at = old.engagement_updated_at;
  end if;
  return new;
end;
$$;

create table if not exists public.reader_engagement_sessions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique check (char_length(session_hash) = 64),
  actor_hash text not null check (char_length(actor_hash) = 64),
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  chapter_number integer not null check (chapter_number > 0),
  started_date date not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_seconds integer not null default 0 check (active_seconds between 0 and 21600),
  max_progress numeric(5,2) not null default 0 check (max_progress between 0 and 100),
  completed boolean not null default false,
  completed_at timestamptz
);

create table if not exists public.reader_book_days (
  metric_date date not null,
  book_id uuid not null references public.books(id) on delete cascade,
  actor_hash text not null check (char_length(actor_hash) = 64),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (metric_date, book_id, actor_hash)
);

create table if not exists public.reader_chapter_days (
  metric_date date not null,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_number integer not null check (chapter_number > 0),
  actor_hash text not null check (char_length(actor_hash) = 64),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (metric_date, chapter_id, actor_hash)
);

create table if not exists public.book_engagement_daily (
  metric_date date not null,
  book_id uuid not null references public.books(id) on delete cascade,
  unique_readers bigint not null default 0 check (unique_readers >= 0),
  new_readers bigint not null default 0 check (new_readers >= 0),
  returning_readers bigint not null default 0 check (returning_readers >= 0),
  sessions bigint not null default 0 check (sessions >= 0),
  chapter_starts bigint not null default 0 check (chapter_starts >= 0),
  chapter_completions bigint not null default 0 check (chapter_completions >= 0),
  active_seconds bigint not null default 0 check (active_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (metric_date, book_id)
);

create table if not exists public.chapter_engagement_daily (
  metric_date date not null,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_number integer not null check (chapter_number > 0),
  unique_readers bigint not null default 0 check (unique_readers >= 0),
  sessions bigint not null default 0 check (sessions >= 0),
  completions bigint not null default 0 check (completions >= 0),
  active_seconds bigint not null default 0 check (active_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (metric_date, chapter_id)
);

create index if not exists engagement_sessions_book_date_idx
  on public.reader_engagement_sessions (book_id, started_date desc);
create index if not exists engagement_sessions_chapter_date_idx
  on public.reader_engagement_sessions (chapter_id, started_date desc);
create index if not exists engagement_sessions_actor_book_idx
  on public.reader_engagement_sessions (actor_hash, book_id, started_at desc);
create index if not exists reader_book_days_book_actor_date_idx
  on public.reader_book_days (book_id, actor_hash, metric_date desc);
create index if not exists reader_book_days_book_date_idx
  on public.reader_book_days (book_id, metric_date desc);
create index if not exists reader_chapter_days_book_date_idx
  on public.reader_chapter_days (book_id, metric_date desc);
create index if not exists reader_chapter_days_chapter_date_idx
  on public.reader_chapter_days (chapter_id, metric_date desc);
create index if not exists book_engagement_daily_book_date_idx
  on public.book_engagement_daily (book_id, metric_date desc);
create index if not exists chapter_engagement_daily_book_date_idx
  on public.chapter_engagement_daily (book_id, metric_date desc);

alter table public.reader_engagement_sessions enable row level security;
alter table public.reader_book_days enable row level security;
alter table public.reader_chapter_days enable row level security;
alter table public.book_engagement_daily enable row level security;
alter table public.chapter_engagement_daily enable row level security;

revoke all on public.reader_engagement_sessions from anon, authenticated;
revoke all on public.reader_book_days from anon, authenticated;
revoke all on public.reader_chapter_days from anon, authenticated;

grant select on public.book_engagement_daily to authenticated;
grant select on public.chapter_engagement_daily to authenticated;

drop policy if exists "authors read own book engagement" on public.book_engagement_daily;
create policy "authors read own book engagement"
on public.book_engagement_daily
for select to authenticated
using (
  exists (
    select 1
    from public.books b
    join public.authors a on a.id=b.author_id
    where b.id=book_id
      and (a.user_id=(select auth.uid()) or (select private.is_admin()))
  )
);

drop policy if exists "authors read own chapter engagement" on public.chapter_engagement_daily;
create policy "authors read own chapter engagement"
on public.chapter_engagement_daily
for select to authenticated
using (
  exists (
    select 1
    from public.books b
    join public.authors a on a.id=b.author_id
    where b.id=book_id
      and (a.user_id=(select auth.uid()) or (select private.is_admin()))
  )
);

create or replace function private.record_reader_engagement_internal(
  p_book_id uuid,
  p_chapter_id uuid,
  p_chapter_number integer,
  p_install_id text,
  p_session_id text,
  p_progress numeric default 0,
  p_active_seconds integer default 0
)
returns table (
  accepted boolean,
  new_reader_day boolean,
  session_completed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := now();
  v_date date := (timezone('UTC', now()))::date;
  v_actor_material text;
  v_actor_hash text;
  v_session_hash text;
  v_session public.reader_engagement_sessions%rowtype;
  v_progress numeric(5,2);
  v_active integer;
  v_max_credible integer;
  v_new_reader_day boolean := false;
begin
  if p_book_id is null or p_chapter_id is null or p_chapter_number is null or p_chapter_number < 1 then
    return query select false, false, false;
    return;
  end if;

  if p_install_id is null or char_length(p_install_id) < 16 or char_length(p_install_id) > 128
     or p_install_id !~ '^[A-Za-z0-9._:-]+$' then
    return query select false, false, false;
    return;
  end if;

  if p_session_id is null or char_length(p_session_id) < 16 or char_length(p_session_id) > 128
     or p_session_id !~ '^[A-Za-z0-9._:-]+$' then
    return query select false, false, false;
    return;
  end if;

  if not exists (
    select 1
    from public.chapters c
    join public.books b on b.id=c.book_id
    join public.authors a on a.id=b.author_id
    where c.id=p_chapter_id
      and c.book_id=p_book_id
      and c.chapter_number=p_chapter_number
      and c.status='published'
      and c.moderation_state='approved'
      and b.visibility='public'
      and b.status <> 'draft'
      and b.moderation_state='approved'
      and a.moderation_state='approved'
  ) then
    return query select false, false, false;
    return;
  end if;

  v_actor_material := case
    when v_uid is not null then 'u:' || v_uid::text
    else 'i:' || p_install_id
  end;
  v_actor_hash := encode(extensions.digest('chuong:actor:v1:' || v_actor_material, 'sha256'), 'hex');
  v_session_hash := encode(extensions.digest('chuong:session:v1:' || v_actor_hash || ':' || p_session_id, 'sha256'), 'hex');
  v_progress := greatest(0, least(100, coalesce(p_progress,0)));

  select * into v_session
  from public.reader_engagement_sessions
  where session_hash=v_session_hash
  for update;

  if v_session.id is null then
    insert into public.reader_engagement_sessions(
      session_hash,actor_hash,book_id,chapter_id,chapter_number,started_date,
      started_at,last_seen_at,active_seconds,max_progress,completed,completed_at
    ) values (
      v_session_hash,v_actor_hash,p_book_id,p_chapter_id,p_chapter_number,v_date,
      v_now,v_now,0,v_progress,(v_progress >= 90),
      case when v_progress >= 90 then v_now else null end
    )
    returning * into v_session;
  else
    if v_session.actor_hash <> v_actor_hash
       or v_session.book_id <> p_book_id
       or v_session.chapter_id <> p_chapter_id
       or v_session.chapter_number <> p_chapter_number then
      return query select false, false, false;
      return;
    end if;

    if v_session.started_at < v_now - interval '6 hours' then
      return query select false, false, v_session.completed;
      return;
    end if;
  end if;

  v_max_credible := least(
    21600,
    greatest(0, floor(extract(epoch from (v_now - v_session.started_at)))::integer + 30)
  );
  v_active := greatest(v_session.active_seconds, least(greatest(0, coalesce(p_active_seconds,0)), v_max_credible));

  update public.reader_engagement_sessions
  set last_seen_at=v_now,
      active_seconds=v_active,
      max_progress=greatest(max_progress,v_progress),
      completed=(completed or v_progress >= 90),
      completed_at=case
        when completed_at is not null then completed_at
        when v_progress >= 90 then v_now
        else null
      end
  where id=v_session.id
  returning * into v_session;

  insert into public.reader_book_days(metric_date,book_id,actor_hash,first_seen_at,last_seen_at)
  values(v_date,p_book_id,v_actor_hash,v_now,v_now)
  on conflict (metric_date,book_id,actor_hash) do nothing
  returning true into v_new_reader_day;

  if not coalesce(v_new_reader_day,false) then
    update public.reader_book_days
    set last_seen_at=v_now
    where metric_date=v_date and book_id=p_book_id and actor_hash=v_actor_hash;
  end if;

  insert into public.reader_chapter_days(metric_date,chapter_id,book_id,chapter_number,actor_hash,first_seen_at,last_seen_at)
  values(v_date,p_chapter_id,p_book_id,p_chapter_number,v_actor_hash,v_now,v_now)
  on conflict (metric_date,chapter_id,actor_hash) do update
  set last_seen_at=excluded.last_seen_at;

  return query select true, coalesce(v_new_reader_day,false), v_session.completed;
end;
$$;

revoke all on function private.record_reader_engagement_internal(uuid,uuid,integer,text,text,numeric,integer) from public;
grant execute on function private.record_reader_engagement_internal(uuid,uuid,integer,text,text,numeric,integer)
  to anon, authenticated;

create or replace function public.record_reader_engagement(
  p_book_id uuid,
  p_chapter_id uuid,
  p_chapter_number integer,
  p_install_id text,
  p_session_id text,
  p_progress numeric default 0,
  p_active_seconds integer default 0
)
returns table (
  accepted boolean,
  new_reader_day boolean,
  session_completed boolean
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.record_reader_engagement_internal(
    p_book_id,p_chapter_id,p_chapter_number,p_install_id,p_session_id,p_progress,p_active_seconds
  );
$$;

revoke execute on function public.record_reader_engagement(uuid,uuid,integer,text,text,numeric,integer)
  from public;
grant execute on function public.record_reader_engagement(uuid,uuid,integer,text,text,numeric,integer)
  to anon, authenticated;

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

create or replace function private.get_author_engagement_summary_internal(
  p_author_id uuid,
  p_days integer default 30
)
returns table (
  reader_count bigint,
  returning_readers bigint,
  sessions bigint,
  chapter_starts bigint,
  chapter_completions bigint,
  active_seconds bigint,
  completion_rate numeric,
  return_rate numeric,
  avg_session_minutes numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_days integer := greatest(1,least(coalesce(p_days,30),365));
  v_from date := (timezone('UTC', now()))::date - (v_days - 1);
begin
  if v_uid is null or not (
    exists(select 1 from public.authors a where a.id=p_author_id and a.user_id=v_uid)
    or (select private.is_admin())
  ) then
    raise exception 'AUTHOR_ANALYTICS_ACCESS_DENIED' using errcode='42501';
  end if;

  return query
  with author_books as (
    select b.id
    from public.books b
    where b.author_id=p_author_id
  ),
  actors as (
    select d.actor_hash, count(distinct d.metric_date)::bigint as active_days
    from public.reader_book_days d
    join author_books b on b.id=d.book_id
    where d.metric_date >= v_from
    group by d.actor_hash
  ),
  totals as (
    select
      coalesce(sum(m.sessions),0)::bigint as sessions,
      coalesce(sum(m.chapter_starts),0)::bigint as starts,
      coalesce(sum(m.chapter_completions),0)::bigint as completions,
      coalesce(sum(m.active_seconds),0)::bigint as active_seconds
    from public.book_engagement_daily m
    join author_books b on b.id=m.book_id
    where m.metric_date >= v_from
  )
  select
    (select count(*)::bigint from actors),
    (select count(*)::bigint from actors where active_days >= 2),
    t.sessions,
    t.starts,
    t.completions,
    t.active_seconds,
    round(case when t.starts > 0 then t.completions::numeric * 100 / t.starts else 0 end,2),
    round(case when (select count(*) from actors) > 0
      then (select count(*) from actors where active_days >= 2)::numeric * 100 / (select count(*) from actors)
      else 0 end,2),
    round(case when t.sessions > 0 then t.active_seconds::numeric / t.sessions / 60 else 0 end,2)
  from totals t;
end;
$$;

revoke all on function private.get_author_engagement_summary_internal(uuid,integer) from public;
grant execute on function private.get_author_engagement_summary_internal(uuid,integer) to authenticated;

create or replace function public.get_author_engagement_summary(
  p_author_id uuid,
  p_days integer default 30
)
returns table (
  reader_count bigint,
  returning_readers bigint,
  sessions bigint,
  chapter_starts bigint,
  chapter_completions bigint,
  active_seconds bigint,
  completion_rate numeric,
  return_rate numeric,
  avg_session_minutes numeric
)
language sql
security invoker
set search_path = ''
stable
as $$
  select * from private.get_author_engagement_summary_internal(p_author_id,p_days);
$$;

revoke execute on function public.get_author_engagement_summary(uuid,integer) from public, anon;
grant execute on function public.get_author_engagement_summary(uuid,integer) to authenticated;

create or replace function public.get_author_engagement_daily(
  p_author_id uuid,
  p_days integer default 30
)
returns table (
  metric_date date,
  unique_readers bigint,
  new_readers bigint,
  returning_readers bigint,
  sessions bigint,
  chapter_completions bigint,
  active_seconds bigint
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    m.metric_date,
    sum(m.unique_readers)::bigint,
    sum(m.new_readers)::bigint,
    sum(m.returning_readers)::bigint,
    sum(m.sessions)::bigint,
    sum(m.chapter_completions)::bigint,
    sum(m.active_seconds)::bigint
  from public.book_engagement_daily m
  join public.books b on b.id=m.book_id
  where b.author_id=p_author_id
    and m.metric_date >= (timezone('UTC', now()))::date - (greatest(1,least(coalesce(p_days,30),365)) - 1)
  group by m.metric_date
  order by m.metric_date;
$$;

revoke execute on function public.get_author_engagement_daily(uuid,integer) from public, anon;
grant execute on function public.get_author_engagement_daily(uuid,integer) to authenticated;

create or replace function public.get_author_book_engagement(
  p_author_id uuid,
  p_days integer default 30
)
returns table (
  book_id uuid,
  title text,
  unique_reader_days bigint,
  sessions bigint,
  chapter_completions bigint,
  active_seconds bigint,
  completion_rate numeric
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    b.id,
    b.title,
    coalesce(sum(m.unique_readers),0)::bigint,
    coalesce(sum(m.sessions),0)::bigint,
    coalesce(sum(m.chapter_completions),0)::bigint,
    coalesce(sum(m.active_seconds),0)::bigint,
    round(
      case when coalesce(sum(m.chapter_starts),0) > 0
        then coalesce(sum(m.chapter_completions),0)::numeric * 100 / sum(m.chapter_starts)
        else 0
      end,
      2
    )
  from public.books b
  left join public.book_engagement_daily m
    on m.book_id=b.id
   and m.metric_date >= (timezone('UTC', now()))::date - (greatest(1,least(coalesce(p_days,30),365)) - 1)
  where b.author_id=p_author_id
  group by b.id,b.title
  order by coalesce(sum(m.unique_readers),0) desc,b.updated_at desc,b.id;
$$;

revoke execute on function public.get_author_book_engagement(uuid,integer) from public, anon;
grant execute on function public.get_author_book_engagement(uuid,integer) to authenticated;

-- Refresh recent rollups every five minutes. Sessions are per-reader rows, avoiding hot aggregate-row writes.
do $$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job where jobname='chuong-engagement-rollup' loop
    perform cron.unschedule(v_job);
  end loop;
  perform cron.schedule(
    'chuong-engagement-rollup',
    '*/5 * * * *',
    'select private.refresh_engagement_rollups((timezone(''UTC'', now()))::date - 1, (timezone(''UTC'', now()))::date);'
  );
end $$;

-- Keep pseudonymous actor/session detail bounded while preserving compact daily aggregates indefinitely.
do $$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job where jobname='chuong-engagement-retention' loop
    perform cron.unschedule(v_job);
  end loop;
  perform cron.schedule(
    'chuong-engagement-retention',
    '17 3 * * *',
    'delete from public.reader_engagement_sessions where last_seen_at < now() - interval ''180 days''; delete from public.reader_chapter_days where metric_date < (timezone(''UTC'', now()))::date - 400; delete from public.reader_book_days where metric_date < (timezone(''UTC'', now()))::date - 400;'
  );
end $$;

commit;
