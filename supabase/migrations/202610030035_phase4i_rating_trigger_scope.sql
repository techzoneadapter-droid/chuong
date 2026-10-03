-- CHUONG Phase 4I: avoid recomputing book rating on helpful-count/text-only updates
begin;

drop trigger if exists book_reviews_refresh_rating on public.book_reviews;
drop trigger if exists book_reviews_refresh_rating_insert_delete on public.book_reviews;
drop trigger if exists book_reviews_refresh_rating_update on public.book_reviews;

create trigger book_reviews_refresh_rating_insert_delete
after insert or delete on public.book_reviews
for each row execute function public.book_reviews_refresh_rating_trigger();

create trigger book_reviews_refresh_rating_update
after update of rating, moderation_state, book_id on public.book_reviews
for each row execute function public.book_reviews_refresh_rating_trigger();

commit;
