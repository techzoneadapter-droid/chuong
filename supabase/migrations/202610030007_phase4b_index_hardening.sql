-- CHUONG Phase 4B: entitlement/revenue FK index hardening
begin;
create index if not exists book_entitlements_wallet_tx_idx
  on public.book_entitlements (wallet_transaction_id)
  where wallet_transaction_id is not null;
create index if not exists chapter_entitlements_wallet_tx_idx
  on public.chapter_entitlements (wallet_transaction_id)
  where wallet_transaction_id is not null;
create index if not exists author_revenue_ledger_book_entitlement_idx
  on public.author_revenue_ledger (book_entitlement_id)
  where book_entitlement_id is not null;
create index if not exists author_revenue_ledger_chapter_entitlement_idx
  on public.author_revenue_ledger (chapter_entitlement_id)
  where chapter_entitlement_id is not null;
create index if not exists author_revenue_ledger_wallet_tx_idx
  on public.author_revenue_ledger (wallet_transaction_id)
  where wallet_transaction_id is not null;
commit;
