-- CHUONG Phase 4K: function execution ACL hardening
begin;

-- Supabase/Postgres default function privileges may grant EXECUTE directly
-- to API roles. Revoke explicit anon access from authenticated-only social
-- functions, then grant the exact intended roles.
revoke execute on function public.get_my_reader_privacy() from anon;
revoke execute on function public.update_reader_privacy(boolean, boolean, boolean, boolean, boolean) from anon;
revoke execute on function public.set_reader_follow(uuid, boolean) from anon;
revoke execute on function public.set_reader_mute(uuid, boolean) from anon;
revoke execute on function public.set_reader_block(uuid, boolean) from anon;
revoke execute on function public.get_community_feed(integer) from anon;

grant execute on function public.get_my_reader_privacy() to authenticated, service_role;
grant execute on function public.update_reader_privacy(boolean, boolean, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function public.set_reader_follow(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_reader_mute(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_reader_block(uuid, boolean) to authenticated, service_role;
grant execute on function public.get_community_feed(integer) to authenticated, service_role;

-- These four are intentionally public because they only return privacy-filtered
-- public profile/community data.
grant execute on function public.get_public_reader_profile(uuid) to anon, authenticated, service_role;
grant execute on function public.get_public_reader_shelf(uuid, integer) to anon, authenticated, service_role;
grant execute on function public.get_reader_public_activity(uuid, integer) to anon, authenticated, service_role;
grant execute on function public.search_public_readers(text, integer) to anon, authenticated, service_role;

commit;
