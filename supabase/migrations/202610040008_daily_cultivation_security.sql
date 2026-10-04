-- CHUONG Phase 4L1 security hardening for daily cultivation rewards
begin;

revoke insert, update, delete on public.daily_cultivation_days from anon, authenticated;
revoke insert, update, delete on public.daily_cultivation_claims from anon, authenticated;

revoke all on function private.daily_cultivation_metrics(uuid,date) from public, anon, authenticated;
revoke all on function private.credit_daily_cultivation_reward(uuid,date,text,integer) from public, anon, authenticated;

revoke execute on function public.get_daily_cultivation() from public, anon;
revoke execute on function public.claim_daily_cultivation(text) from public, anon;
grant execute on function public.get_daily_cultivation() to authenticated;
grant execute on function public.claim_daily_cultivation(text) to authenticated;

commit;