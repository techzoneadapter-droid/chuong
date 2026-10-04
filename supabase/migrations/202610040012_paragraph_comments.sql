-- CHUONG Phase 4L3: paragraph-level discussion anchors
begin;

alter table public.comments
  add column if not exists paragraph_index integer,
  add column if not exists paragraph_excerpt text;

alter table public.comments
  drop constraint if exists comments_paragraph_index_check;
alter table public.comments
  add constraint comments_paragraph_index_check
  check (paragraph_index is null or paragraph_index >= 0);

alter table public.comments
  drop constraint if exists comments_paragraph_excerpt_length;
alter table public.comments
  add constraint comments_paragraph_excerpt_length
  check (paragraph_excerpt is null or char_length(paragraph_excerpt) <= 280);

create index if not exists comments_chapter_paragraph_created_idx
  on public.comments (chapter_id, paragraph_index, created_at)
  where chapter_id is not null and paragraph_index is not null;

commit;