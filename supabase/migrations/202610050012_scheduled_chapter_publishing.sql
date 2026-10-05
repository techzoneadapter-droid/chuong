-- CHUONG Phase 4Q1: scheduled chapter publishing.
-- Authors/admins can upload chapters as drafts and release them automatically
-- at a fixed cadence such as 1/day, 2/day, 3/day...
begin;

alter table public.chapters
  add column if not exists scheduled_publish_at timestamptz;

alter table public.books
  add column if not exists schedule_final_status public.book_status;

alter table public.books
  drop constraint if exists books_schedule_final_status_not_draft;
alter table public.books
  add constraint books_schedule_final_status_not_draft
  check (schedule_final_status is null or schedule_final_status <> 'draft'::public.book_status);

create index if not exists chapters_scheduled_publish_due_idx
  on public.chapters (scheduled_publish_at, book_id)
  where status = 'draft' and scheduled_publish_at is not null;

create or replace function public.validate_chapter_publication()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if tg_op = 'UPDATE' and new.book_id <> old.book_id then
    raise exception 'chapter book cannot be changed';
  end if;

  if new.scheduled_publish_at is not null then
    if new.status <> 'draft'::public.chapter_status then
      raise exception 'scheduled chapter must remain draft until release';
    end if;
    if char_length(trim(new.title)) < 2 or char_length(trim(new.content)) < 50 then
      raise exception 'scheduled chapter requires title and at least 50 characters';
    end if;
  end if;

  if new.status = 'published'::public.chapter_status then
    if char_length(trim(new.title)) < 2 or char_length(trim(new.content)) < 50 then
      raise exception 'published chapter requires title and at least 50 characters';
    end if;
    if tg_op = 'INSERT' then
      new.published_at = now();
    elsif old.status <> 'published'::public.chapter_status then
      new.published_at = now();
    else
      new.published_at = coalesce(old.published_at, now());
    end if;
    new.scheduled_publish_at = null;
  else
    new.published_at = null;
  end if;

  return new;
end;
$$;

create or replace function public.schedule_book_chapters(
  p_book_id uuid,
  p_chapter_numbers integer[],
  p_start_at timestamptz,
  p_per_day integer,
  p_final_status public.book_status default 'ongoing'::public.book_status
)
returns table (
  chapter_number integer,
  scheduled_publish_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author_user uuid;
  v_requested integer;
  v_found integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select a.user_id
  into v_author_user
  from public.books b
  join public.authors a on a.id = b.author_id
  where b.id = p_book_id;

  if v_author_user is null then
    raise exception 'BOOK_NOT_FOUND';
  end if;

  if v_author_user <> v_uid and not (select private.is_admin()) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  if p_chapter_numbers is null or coalesce(array_length(p_chapter_numbers, 1), 0) = 0 then
    raise exception 'NO_CHAPTERS';
  end if;

  if p_per_day < 1 or p_per_day > 24 then
    raise exception 'INVALID_PER_DAY';
  end if;

  if p_start_at is null or p_start_at < now() then
    raise exception 'START_TIME_MUST_BE_FUTURE';
  end if;

  if p_final_status = 'draft'::public.book_status then
    raise exception 'INVALID_FINAL_STATUS';
  end if;

  select count(*)::integer, count(distinct x)::integer
  into v_requested, v_found
  from unnest(p_chapter_numbers) x;

  if v_requested <> v_found then
    raise exception 'DUPLICATE_CHAPTER_NUMBERS';
  end if;

  select count(*)::integer
  into v_found
  from public.chapters c
  where c.book_id = p_book_id
    and c.chapter_number = any(p_chapter_numbers)
    and c.status = 'draft'::public.chapter_status
    and char_length(trim(c.title)) >= 2
    and char_length(trim(c.content)) >= 50;

  if v_found <> v_requested then
    raise exception 'CHAPTERS_NOT_READY';
  end if;

  with ordered as (
    select
      x.chapter_number,
      row_number() over(order by x.chapter_number) - 1 as slot_index
    from unnest(p_chapter_numbers) as x(chapter_number)
  ),
  updated as (
    update public.chapters c
    set scheduled_publish_at =
      p_start_at
      + ((ordered.slot_index * 86400.0 / p_per_day) * interval '1 second')
    from ordered
    where c.book_id = p_book_id
      and c.chapter_number = ordered.chapter_number
      and c.status = 'draft'::public.chapter_status
    returning c.chapter_number, c.scheduled_publish_at
  )
  select count(*)::integer into v_found from updated;

  if v_found <> v_requested then
    raise exception 'SCHEDULE_UPDATE_INCOMPLETE';
  end if;

  update public.books
  set schedule_final_status = p_final_status
  where id = p_book_id;

  return query
  select c.chapter_number, c.scheduled_publish_at
  from public.chapters c
  where c.book_id = p_book_id
    and c.chapter_number = any(p_chapter_numbers)
  order by c.scheduled_publish_at, c.chapter_number;
end;
$$;

revoke execute on function public.schedule_book_chapters(uuid,integer[],timestamptz,integer,public.book_status) from public, anon;
grant execute on function public.schedule_book_chapters(uuid,integer[],timestamptz,integer,public.book_status) to authenticated;

create or replace function public.cancel_book_chapter_schedule(
  p_book_id uuid,
  p_chapter_numbers integer[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author_user uuid;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select a.user_id
  into v_author_user
  from public.books b
  join public.authors a on a.id = b.author_id
  where b.id = p_book_id;

  if v_author_user is null then
    raise exception 'BOOK_NOT_FOUND';
  end if;

  if v_author_user <> v_uid and not (select private.is_admin()) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  update public.chapters c
  set scheduled_publish_at = null
  where c.book_id = p_book_id
    and c.status = 'draft'::public.chapter_status
    and c.scheduled_publish_at is not null
    and (p_chapter_numbers is null or c.chapter_number = any(p_chapter_numbers));

  get diagnostics v_count = row_count;

  if not exists (
    select 1 from public.chapters c
    where c.book_id = p_book_id
      and c.status = 'draft'::public.chapter_status
      and c.scheduled_publish_at is not null
  ) then
    update public.books
    set schedule_final_status = null
    where id = p_book_id;
  end if;

  return v_count;
end;
$$;

revoke execute on function public.cancel_book_chapter_schedule(uuid,integer[]) from public, anon;
grant execute on function public.cancel_book_chapter_schedule(uuid,integer[]) to authenticated;

create or replace function private.publish_due_chapters()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_published integer := 0;
begin
  for v_row in
    select c.id, c.book_id
    from public.chapters c
    where c.status = 'draft'::public.chapter_status
      and c.scheduled_publish_at is not null
      and c.scheduled_publish_at <= now()
    order by c.scheduled_publish_at, c.chapter_number
    limit 500
    for update skip locked
  loop
    begin
      update public.chapters
      set status = 'published'::public.chapter_status
      where id = v_row.id
        and status = 'draft'::public.chapter_status
        and scheduled_publish_at is not null
        and scheduled_publish_at <= now();

      if found then
        v_published := v_published + 1;
        update public.books
        set
          status = case
            when status = 'draft'::public.book_status then 'ongoing'::public.book_status
            else status
          end,
          visibility = 'public'::public.book_visibility
        where id = v_row.book_id;
      end if;
    exception when others then
      -- One malformed row must never block other scheduled releases.
      null;
    end;
  end loop;

  update public.books b
  set
    status = b.schedule_final_status,
    visibility = 'public'::public.book_visibility,
    schedule_final_status = null
  where b.schedule_final_status is not null
    and exists (
      select 1 from public.chapters published
      where published.book_id = b.id
        and published.status = 'published'::public.chapter_status
    )
    and not exists (
      select 1 from public.chapters pending
      where pending.book_id = b.id
        and pending.status = 'draft'::public.chapter_status
        and pending.scheduled_publish_at is not null
    );

  return v_published;
end;
$$;

revoke execute on function private.publish_due_chapters() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'chuong-chapter-publisher'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'chuong-chapter-publisher',
    '* * * * *',
    'select private.publish_due_chapters();'
  );
end $$;

commit;