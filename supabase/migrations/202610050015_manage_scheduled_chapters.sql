-- CHUONG Phase 4Q2: manage scheduled chapter releases after bulk upload.
begin;

create or replace function public.update_scheduled_chapter_time(
  p_book_id uuid,
  p_chapter_number integer,
  p_scheduled_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author_user uuid;
  v_updated_at timestamptz;
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

  if p_scheduled_at is null or p_scheduled_at <= now() then
    raise exception 'START_TIME_MUST_BE_FUTURE';
  end if;

  update public.chapters c
  set scheduled_publish_at = p_scheduled_at
  where c.book_id = p_book_id
    and c.chapter_number = p_chapter_number
    and c.status = 'draft'::public.chapter_status
    and c.scheduled_publish_at is not null
    and char_length(trim(c.title)) >= 2
    and char_length(trim(c.content)) >= 50
  returning c.scheduled_publish_at into v_updated_at;

  if v_updated_at is null then
    raise exception 'SCHEDULED_CHAPTER_NOT_FOUND';
  end if;

  return v_updated_at;
end;
$$;

revoke execute on function public.update_scheduled_chapter_time(uuid,integer,timestamptz) from public, anon;
grant execute on function public.update_scheduled_chapter_time(uuid,integer,timestamptz) to authenticated;

create or replace function public.publish_scheduled_chapter_now(
  p_book_id uuid,
  p_chapter_number integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author_user uuid;
  v_final_status public.book_status;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select a.user_id, b.schedule_final_status
  into v_author_user, v_final_status
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
  set status = 'published'::public.chapter_status
  where c.book_id = p_book_id
    and c.chapter_number = p_chapter_number
    and c.status = 'draft'::public.chapter_status
    and c.scheduled_publish_at is not null;

  if not found then
    raise exception 'SCHEDULED_CHAPTER_NOT_FOUND';
  end if;

  update public.books
  set
    status = 'ongoing'::public.book_status,
    visibility = 'public'::public.book_visibility
  where id = p_book_id;

  if not exists (
    select 1
    from public.chapters pending
    where pending.book_id = p_book_id
      and pending.status = 'draft'::public.chapter_status
      and pending.scheduled_publish_at is not null
  ) then
    update public.books
    set
      status = coalesce(v_final_status, 'ongoing'::public.book_status),
      visibility = 'public'::public.book_visibility,
      schedule_final_status = null
    where id = p_book_id;
  end if;

  return true;
end;
$$;

revoke execute on function public.publish_scheduled_chapter_now(uuid,integer) from public, anon;
grant execute on function public.publish_scheduled_chapter_now(uuid,integer) to authenticated;

commit;