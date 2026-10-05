-- CHUONG Phase 4P1: author events, progress leaderboard and earned badges.
begin;

create table if not exists public.author_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  target_words bigint not null default 0 check (target_words >= 0),
  target_chapters integer not null default 0 check (target_chapters >= 0),
  source_type_filter public.source_type null,
  genre_filter text null,
  badge_key text not null,
  badge_label text not null,
  prize_label text not null default '',
  rules jsonb not null default '[]'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.author_event_entries (
  event_id uuid not null references public.author_events(id) on delete cascade,
  author_id uuid not null references public.authors(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, author_id)
);

create table if not exists public.author_badges (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  event_id uuid not null references public.author_events(id) on delete cascade,
  badge_key text not null,
  label text not null,
  description text not null default '',
  awarded_at timestamptz not null default now(),
  unique(author_id, event_id, badge_key)
);

create index if not exists author_event_entries_author_idx
  on public.author_event_entries(author_id, joined_at desc);
create index if not exists author_badges_author_idx
  on public.author_badges(author_id, awarded_at desc);
create index if not exists author_events_window_idx
  on public.author_events(is_public, starts_at, ends_at);

alter table public.author_events enable row level security;
alter table public.author_event_entries enable row level security;
alter table public.author_badges enable row level security;

drop policy if exists "public reads author events" on public.author_events;
create policy "public reads author events"
on public.author_events for select
to anon, authenticated
using (is_public = true);

drop policy if exists "authors read own event entries" on public.author_event_entries;
create policy "authors read own event entries"
on public.author_event_entries for select
to authenticated
using (
  exists (
    select 1 from public.authors a
    where a.id = author_id and a.user_id = (select auth.uid())
  )
  or (select private.is_admin())
);

drop policy if exists "public reads author badges" on public.author_badges;
create policy "public reads author badges"
on public.author_badges for select
to anon, authenticated
using (
  exists (
    select 1 from public.authors a
    where a.id = author_id and a.moderation_state = 'approved'
  )
);

revoke insert, update, delete on public.author_events from anon, authenticated;
revoke insert, update, delete on public.author_event_entries from anon, authenticated;
revoke insert, update, delete on public.author_badges from anon, authenticated;
grant select on public.author_events to anon, authenticated;
grant select on public.author_event_entries to authenticated;
grant select on public.author_badges to anon, authenticated;

create or replace function private.author_event_progress(
  p_event_id uuid,
  p_author_id uuid
)
returns table (
  words_written bigint,
  chapters_published bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(
      case
        when btrim(coalesce(c.content,'')) = '' then 0
        else cardinality(regexp_split_to_array(btrim(c.content), E'\\s+'))
      end
    ),0)::bigint as words_written,
    count(c.id)::bigint as chapters_published
  from public.author_event_entries en
  join public.author_events e on e.id = en.event_id
  left join public.books b
    on b.author_id = en.author_id
    and (e.source_type_filter is null or b.source_type = e.source_type_filter)
    and (
      e.genre_filter is null
      or exists (
        select 1 from public.book_genres bg
        where bg.book_id = b.id and lower(bg.genre) = lower(e.genre_filter)
      )
    )
  left join public.chapters c
    on c.book_id = b.id
    and c.status = 'published'
    and c.moderation_state = 'approved'
    and c.published_at is not null
    and c.published_at >= greatest(e.starts_at, en.joined_at)
    and c.published_at <= least(now(), e.ends_at)
  where en.event_id = p_event_id
    and en.author_id = p_author_id;
$$;

revoke execute on function private.author_event_progress(uuid,uuid) from public, anon, authenticated;

create or replace function public.join_author_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author_id uuid;
  v_event public.author_events%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  select a.id into v_author_id
  from public.authors a
  where a.user_id = v_uid;

  if v_author_id is null then raise exception 'AUTHOR_REQUIRED'; end if;

  select * into v_event
  from public.author_events e
  where e.id = p_event_id and e.is_public = true;

  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if now() > v_event.ends_at then raise exception 'EVENT_ENDED'; end if;

  insert into public.author_event_entries(event_id, author_id)
  values(p_event_id, v_author_id)
  on conflict(event_id,author_id) do nothing;

  return true;
end;
$$;

revoke execute on function public.join_author_event(uuid) from public, anon;
grant execute on function public.join_author_event(uuid) to authenticated;

create or replace function public.sync_author_event_badge(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author_id uuid;
  v_event public.author_events%rowtype;
  v_words bigint := 0;
  v_chapters bigint := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  select a.id into v_author_id
  from public.authors a
  where a.user_id = v_uid;

  if v_author_id is null then raise exception 'AUTHOR_REQUIRED'; end if;

  select * into v_event
  from public.author_events e
  where e.id = p_event_id;

  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  if not exists (
    select 1 from public.author_event_entries en
    where en.event_id=p_event_id and en.author_id=v_author_id
  ) then return false; end if;

  select p.words_written,p.chapters_published
  into v_words,v_chapters
  from private.author_event_progress(p_event_id,v_author_id) p;

  if v_words >= v_event.target_words
     and v_chapters >= v_event.target_chapters then
    insert into public.author_badges(
      author_id,event_id,badge_key,label,description
    ) values (
      v_author_id,
      p_event_id,
      v_event.badge_key,
      v_event.badge_label,
      'Hoàn thành mục tiêu sự kiện ' || v_event.title
    )
    on conflict(author_id,event_id,badge_key) do nothing;
    return true;
  end if;

  return false;
end;
$$;

revoke execute on function public.sync_author_event_badge(uuid) from public, anon;
grant execute on function public.sync_author_event_badge(uuid) to authenticated;

create or replace function public.get_author_event_center(p_author_id uuid)
returns table (
  event_id uuid,
  slug text,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  target_words bigint,
  target_chapters integer,
  genre_filter text,
  badge_label text,
  prize_label text,
  rules jsonb,
  joined boolean,
  joined_at timestamptz,
  words_written bigint,
  chapters_published bigint,
  rank_no bigint,
  participant_count bigint,
  badge_awarded boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists (
    select 1 from public.authors a
    where a.id = p_author_id
      and (a.user_id = v_uid or (select private.is_admin()))
  ) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  return query
  with events as (
    select e.*
    from public.author_events e
    where e.is_public=true
      and e.ends_at >= now() - interval '120 days'
    order by e.starts_at desc
  ),
  ranked as (
    select
      en.event_id,
      en.author_id,
      en.joined_at,
      p.words_written,
      p.chapters_published,
      rank() over (
        partition by en.event_id
        order by p.words_written desc, p.chapters_published desc, en.joined_at asc
      )::bigint as rank_no,
      count(*) over (partition by en.event_id)::bigint as participant_count
    from public.author_event_entries en
    cross join lateral private.author_event_progress(en.event_id,en.author_id) p
  )
  select
    e.id,
    e.slug,
    e.title,
    e.description,
    e.starts_at,
    e.ends_at,
    e.target_words,
    e.target_chapters,
    e.genre_filter,
    e.badge_label,
    e.prize_label,
    e.rules,
    (r.author_id is not null) as joined,
    r.joined_at,
    coalesce(r.words_written,0)::bigint,
    coalesce(r.chapters_published,0)::bigint,
    r.rank_no,
    coalesce(r.participant_count,(
      select count(*)::bigint from public.author_event_entries x where x.event_id=e.id
    )) as participant_count,
    exists(
      select 1 from public.author_badges ab
      where ab.author_id=p_author_id and ab.event_id=e.id
    ) as badge_awarded
  from events e
  left join ranked r on r.event_id=e.id and r.author_id=p_author_id
  order by
    case when now() between e.starts_at and e.ends_at then 0
         when now() < e.starts_at then 1 else 2 end,
    e.starts_at desc;
end;
$$;

revoke execute on function public.get_author_event_center(uuid) from public, anon;
grant execute on function public.get_author_event_center(uuid) to authenticated;

create or replace function public.get_author_event_leaderboard(
  p_event_id uuid,
  p_limit integer default 30
)
returns table (
  rank_no bigint,
  author_id uuid,
  pen_name text,
  avatar_url text,
  words_written bigint,
  chapters_published bigint,
  goal_reached boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select
      en.author_id,
      a.pen_name,
      a.avatar_url,
      p.words_written,
      p.chapters_published,
      e.target_words,
      e.target_chapters,
      rank() over (
        order by p.words_written desc, p.chapters_published desc, en.joined_at asc
      )::bigint as rank_no
    from public.author_event_entries en
    join public.author_events e on e.id=en.event_id and e.is_public=true
    join public.authors a on a.id=en.author_id
    cross join lateral private.author_event_progress(en.event_id,en.author_id) p
    where en.event_id=p_event_id
      and a.moderation_state='approved'
  )
  select
    r.rank_no,
    r.author_id,
    r.pen_name,
    r.avatar_url,
    r.words_written,
    r.chapters_published,
    (r.words_written >= r.target_words and r.chapters_published >= r.target_chapters)
  from ranked r
  order by r.rank_no
  limit greatest(1,least(coalesce(p_limit,30),100));
$$;

revoke execute on function public.get_author_event_leaderboard(uuid,integer) from public;
grant execute on function public.get_author_event_leaderboard(uuid,integer) to anon, authenticated;

create or replace function public.get_public_author_badges(p_author_id uuid)
returns table (
  badge_key text,
  label text,
  description text,
  awarded_at timestamptz,
  event_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ab.badge_key,
    ab.label,
    ab.description,
    ab.awarded_at,
    e.title
  from public.author_badges ab
  join public.author_events e on e.id=ab.event_id
  join public.authors a on a.id=ab.author_id
  where ab.author_id=p_author_id
    and a.moderation_state='approved'
  order by ab.awarded_at desc
  limit 20;
$$;

revoke execute on function public.get_public_author_badges(uuid) from public;
grant execute on function public.get_public_author_badges(uuid) to anon, authenticated;

insert into public.author_events(
  id,slug,title,description,starts_at,ends_at,target_words,target_chapters,
  source_type_filter,genre_filter,badge_key,badge_label,prize_label,rules,is_public
)
values(
  'e2026105-0001-4000-8000-000000000001'::uuid,
  'tien-hiep-tan-tinh-thu-2026',
  'Tiên Hiệp Tân Tinh · Thu 2026',
  'Thử thách dành cho tác giả truyện Tiên Hiệp nguyên tác. Viết đều, xuất bản thật và cùng tiến trên bảng xếp hạng CHƯƠNG.',
  '2026-10-05 00:00:00+07',
  '2026-11-30 23:59:59+07',
  30000,
  8,
  'original'::public.source_type,
  'Tiên Hiệp',
  'tien-hiep-tan-tinh-2026',
  'Tân Tinh 2026',
  'Huy hiệu Tân Tinh 2026',
  jsonb_build_array(
    'Chỉ tính chương đã xuất bản và được duyệt sau khi tác giả tham gia sự kiện.',
    'Chỉ tính truyện Tiên Hiệp nguyên tác của chính tác giả.',
    'Xếp hạng theo tổng số từ; nếu bằng nhau ưu tiên số chương đã xuất bản rồi thời điểm tham gia sớm hơn.',
    'Đạt đủ 30.000 từ và 8 chương sẽ nhận huy hiệu Tân Tinh 2026.'
  ),
  true
)
on conflict(slug) do nothing;

commit;