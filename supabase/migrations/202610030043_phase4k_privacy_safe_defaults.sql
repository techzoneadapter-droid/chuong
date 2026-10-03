-- CHUONG Phase 4K: privacy-safe defaults for newly aggregated social activity
begin;

alter table public.reader_privacy
  alter column show_shelves set default false,
  alter column show_reviews set default false,
  alter column show_comments set default false;

-- Profiles were already publicly readable before Phase 4K, so discovery remains
-- on by default. Newly aggregated shelves/reviews/comments are opt-in.
-- Only touch untouched rows whose created/updated timestamps still match.
update public.reader_privacy
set show_shelves = false,
    show_reviews = false,
    show_comments = false
where created_at = updated_at
  and show_shelves
  and show_reviews
  and show_comments;

commit;
