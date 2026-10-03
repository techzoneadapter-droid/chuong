-- CHUONG Phase 4H: keep conflict-safe progress sync under normal owner RLS
begin;

alter function public.sync_reading_progress(
  uuid, uuid, integer, numeric, numeric, timestamptz
) security invoker;

commit;
