-- CHUONG Phase 4L1: remove default table grants from daily reward state
begin;

revoke all privileges on table public.daily_cultivation_days from anon, authenticated;
revoke all privileges on table public.daily_cultivation_claims from anon, authenticated;
grant select on table public.daily_cultivation_days to authenticated;
grant select on table public.daily_cultivation_claims to authenticated;

commit;