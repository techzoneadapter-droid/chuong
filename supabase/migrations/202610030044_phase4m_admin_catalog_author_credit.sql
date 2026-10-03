alter table public.books
  add column if not exists credited_author_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'books_credited_author_name_check'
      and conrelid = 'public.books'::regclass
  ) then
    alter table public.books
      add constraint books_credited_author_name_check
      check (
        credited_author_name is null
        or (
          char_length(trim(credited_author_name)) between 2 and 120
        )
      );
  end if;
end $$;

comment on column public.books.credited_author_name is
  'Optional public author credit used for platform/admin catalog entries. Internal author_id remains the ownership/security principal.';

create or replace function private.refresh_book_search_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.search_text := private.search_normalize(
    concat_ws(
      ' ',
      new.title,
      new.credited_author_name,
      new.description,
      array_to_string(new.tags, ' ')
    )
  );
  return new;
end;
$$;

drop trigger if exists books_refresh_search_text on public.books;
create trigger books_refresh_search_text
before insert or update of title, credited_author_name, description, tags
on public.books
for each row execute function private.refresh_book_search_text();

update public.books
set search_text = private.search_normalize(
  concat_ws(
    ' ',
    title,
    credited_author_name,
    description,
    array_to_string(tags, ' ')
  )
)
where true;
