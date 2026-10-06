-- Return the exact junk lines found during Admin content hygiene preview.
-- This is deterministic/rule-based and does not call any AI provider.
begin;

create or replace function public.admin_content_hygiene_items(p_book_id uuid)
returns table(
  book_id uuid,
  book_title text,
  chapter_id uuid,
  chapter_number integer,
  chapter_title text,
  line_number integer,
  junk_text text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'admin_required' using errcode='42501';
  end if;

  return query
  select
    b.id,
    b.title,
    c.id,
    c.chapter_number,
    coalesce(c.title,''),
    x.ord::integer,
    trim(x.line)
  from public.books b
  join public.chapters c on c.book_id=b.id
  cross join lateral regexp_split_to_table(coalesce(c.content,''), E'\\r?\\n')
    with ordinality as x(line,ord)
  where b.id=p_book_id
    and private.is_story_junk_line(x.line)
  order by c.chapter_number,x.ord,c.id;
end;
$$;

revoke all on function public.admin_content_hygiene_items(uuid) from public,anon;
grant execute on function public.admin_content_hygiene_items(uuid) to authenticated;

commit;
