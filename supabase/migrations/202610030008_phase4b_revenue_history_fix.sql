-- CHUONG Phase 4B: preserve revenue history when user entitlements are removed
begin;
alter table public.author_revenue_ledger
  drop constraint if exists author_revenue_exact_source;
alter table public.author_revenue_ledger
  add constraint author_revenue_at_most_one_source
  check (num_nonnulls(book_entitlement_id, chapter_entitlement_id) <= 1);
commit;
