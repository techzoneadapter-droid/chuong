-- CHUONG Phase 4N1 hotfix: public reader wrapper is SECURITY INVOKER
-- and therefore anon/authenticated must be able to execute the private read implementation.
begin;
grant execute on function private.get_chapter_for_reading_impl(uuid,integer) to anon, authenticated;
commit;