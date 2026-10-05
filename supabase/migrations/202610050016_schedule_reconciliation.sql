-- CHUONG Phase 4Q2: keep book schedule state consistent when a scheduled
-- chapter is manually published or deleted outside the schedule manager.
begin;

create or replace function private.reconcile_book_schedule_after_chapter_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book_id uuid;
  v_final public.book_status;
begin
  v_book_id := coalesce(new.book_id, old.book_id);

  -- Ignore chapter changes unrelated to a scheduled slot.
  if tg_op = 'UPDATE'
     and old.scheduled_publish_at is not distinct from new.scheduled_publish_at
     and old.status is not distinct from new.status then
    return coalesce(new, old);
  end if;

  if exists (
    select 1
    from public.chapters c
    where c.book_id = v_book_id
      and c.status = 'draft'::public.chapter_status
      and c.scheduled_publish_at is not null
  ) then
    return coalesce(new, old);
  end if;

  select b.schedule_final_status
  into v_final
  from public.books b
  where b.id = v_book_id;

  if v_final is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE'
     and old.scheduled_publish_at is not null
     and new.status = 'published'::public.chapter_status then
    update public.books
    set
      status = v_final,
      visibility = 'public'::public.book_visibility,
      schedule_final_status = null
    where id = v_book_id;
  else
    -- Last scheduled slot was removed/cancelled rather than released.
    update public.books
    set schedule_final_status = null
    where id = v_book_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists chapters_reconcile_schedule on public.chapters;
create trigger chapters_reconcile_schedule
after update or delete on public.chapters
for each row
execute function private.reconcile_book_schedule_after_chapter_change();

revoke execute on function private.reconcile_book_schedule_after_chapter_change() from public, anon, authenticated;

commit;