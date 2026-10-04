-- CHUONG Phase 4L3: validate paragraph discussion anchors
begin;

create or replace function public.validate_comment_anchor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.comments%rowtype;
begin
  if new.chapter_id is null and new.paragraph_index is not null then
    raise exception 'Paragraph comments require a chapter';
  end if;

  if new.chapter_id is not null and not exists (
    select 1 from public.chapters c
    where c.id=new.chapter_id and c.book_id=new.book_id
  ) then
    raise exception 'Comment chapter does not belong to book';
  end if;

  if new.parent_id is not null then
    select * into v_parent from public.comments where id=new.parent_id;
    if v_parent.id is null then raise exception 'Parent comment not found'; end if;
    if v_parent.book_id <> new.book_id
       or v_parent.chapter_id is distinct from new.chapter_id
       or v_parent.paragraph_index is distinct from new.paragraph_index then
      raise exception 'Reply anchor must match parent comment';
    end if;
  end if;

  if new.paragraph_index is null then
    new.paragraph_excerpt := null;
  elsif new.paragraph_excerpt is not null then
    new.paragraph_excerpt := left(btrim(new.paragraph_excerpt),280);
  end if;

  return new;
end;
$$;

drop trigger if exists comments_validate_anchor on public.comments;
create trigger comments_validate_anchor
before insert or update of book_id,chapter_id,parent_id,paragraph_index,paragraph_excerpt
on public.comments
for each row execute function public.validate_comment_anchor();

commit;