-- CHUONG Phase 4Q1 hotfix: allow the scheduler to transition a due
-- draft into published; publishing clears scheduled_publish_at in the same trigger.
begin;

create or replace function public.validate_chapter_publication()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if tg_op = 'UPDATE' and new.book_id <> old.book_id then
    raise exception 'chapter book cannot be changed';
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

    -- A scheduled release is no longer pending once it becomes public.
    new.scheduled_publish_at = null;
  else
    new.published_at = null;

    if new.scheduled_publish_at is not null then
      if char_length(trim(new.title)) < 2 or char_length(trim(new.content)) < 50 then
        raise exception 'scheduled chapter requires title and at least 50 characters';
      end if;
    end if;
  end if;

  return new;
end;
$$;

commit;