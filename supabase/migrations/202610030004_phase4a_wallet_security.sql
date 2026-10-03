-- CHUONG Phase 4A: lock down wallet trigger helper
begin;
revoke execute on function public.ensure_wallet_for_profile() from public, anon, authenticated;
commit;
