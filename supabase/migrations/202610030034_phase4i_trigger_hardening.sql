-- CHUONG Phase 4I: run internal aggregate triggers with owner privileges only
begin;

alter function public.book_reviews_refresh_rating_trigger() security definer;
revoke execute on function public.book_reviews_refresh_rating_trigger() from public, anon, authenticated;

alter function public.review_helpful_refresh_trigger() security definer;
revoke execute on function public.review_helpful_refresh_trigger() from public, anon, authenticated;

commit;
