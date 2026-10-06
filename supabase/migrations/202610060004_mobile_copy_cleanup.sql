-- Mobile/public copy cleanup for Admin-imported catalog.
-- Keeps internal source_type for rights/compliance, but removes technical import
-- filenames from reader-facing descriptions. Also removes a duplicated leading
-- "Chương N" marker from chapter bodies when it matches that row's chapter number.

begin;

update public.books
set description = 'Hãy khám phá.',
    updated_at = now()
where description is null
   or btrim(description) = ''
   or description ilike 'Truyện được Admin nhập hàng loạt từ %'
   or description ilike 'Truyện được quản trị viên nhập bằng CHƯƠNG Upload Studio%'
   or description ilike 'Truyện được nhập vào Tàng Kinh Các từ nguồn %'
   or description ilike 'Truyện được nhập bằng CHƯƠNG Content Studio từ nguồn %';

update public.chapters
set content = ltrim(
  regexp_replace(
    content,
    '^\s*(chương|chuong|chapter|chap)\s*(số\s*)?' || chapter_number::text ||
    '(\s*[/]\s*[0-9]+)?\s*[:.\-–—]?\s+',
    '',
    'i'
  )
)
where content ~* (
  '^\s*(chương|chuong|chapter|chap)\s*(số\s*)?' || chapter_number::text ||
  '(\s*[/]\s*[0-9]+)?\s*[:.\-–—]?\s+'
);

commit;
