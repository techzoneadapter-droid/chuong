-- CHUONG Phase 4M1: transaction types for reader gifts.
alter type public.wallet_transaction_type add value if not exists 'gift_debit';
alter type public.author_revenue_type add value if not exists 'gift';
