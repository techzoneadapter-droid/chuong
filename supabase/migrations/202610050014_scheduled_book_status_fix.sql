-- CHUONG Phase 4Q1: when a scheduled chapter is released,
-- the book is actively serializing until the last scheduled chapter.
begin;

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
          status = 'ongoing'::public.book_status,
          visibility = 'public'::public.book_visibility
        where id = v_row.book_id;
      end if;
    exception when others then
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

commit;