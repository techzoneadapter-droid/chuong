-- CHUONG Phase 4H: timestamp-aware progress sync for offline/cross-device safety
begin;

create or replace function public.sync_reading_progress(
  p_book_id uuid,
  p_chapter_id uuid,
  p_chapter_number integer,
  p_progress_percent numeric,
  p_scroll_position numeric,
  p_updated_at timestamptz
)
returns public.reading_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.reading_progress%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  if p_chapter_number < 1 then
    raise exception 'INVALID_CHAPTER_NUMBER';
  end if;

  insert into public.reading_progress(
    user_id,
    book_id,
    chapter_id,
    chapter_number,
    progress_percent,
    scroll_position,
    updated_at
  )
  values (
    v_uid,
    p_book_id,
    p_chapter_id,
    p_chapter_number,
    greatest(0, least(100, coalesce(p_progress_percent, 0))),
    greatest(0, coalesce(p_scroll_position, 0)),
    coalesce(p_updated_at, now())
  )
  on conflict (user_id, book_id) do update
  set chapter_id = excluded.chapter_id,
      chapter_number = excluded.chapter_number,
      progress_percent = excluded.progress_percent,
      scroll_position = excluded.scroll_position,
      updated_at = excluded.updated_at
  where excluded.updated_at >= public.reading_progress.updated_at
  returning * into v_row;

  if v_row.user_id is null then
    select * into v_row
    from public.reading_progress
    where user_id=v_uid and book_id=p_book_id;
  end if;

  return v_row;
end;
$$;

revoke execute on function public.sync_reading_progress(uuid,uuid,integer,numeric,numeric,timestamptz)
  from public, anon;
grant execute on function public.sync_reading_progress(uuid,uuid,integer,numeric,numeric,timestamptz)
  to authenticated;

commit;
