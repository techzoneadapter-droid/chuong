-- CHƯƠNG Phase 4N hardening: Premium lookup is server-only.
begin;

revoke execute on function public.has_active_premium(uuid) from public, anon, authenticated;
grant execute on function public.has_active_premium(uuid) to service_role;

commit;
