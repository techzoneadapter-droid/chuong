-- CHUONG: remove abandoned paragraph-discussion experiment.
begin;

drop trigger if exists comments_validate_anchor on public.comments;
drop function if exists public.validate_comment_anchor();
drop index if exists public.comments_chapter_paragraph_created_idx;

alter table public.comments
  drop constraint if exists comments_paragraph_index_check,
  drop constraint if exists comments_paragraph_excerpt_length,
  drop column if exists paragraph_index,
  drop column if exists paragraph_excerpt;

commit;