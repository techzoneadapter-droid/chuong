-- CHUONG scale hardening: push foreign-key index and consolidated device read policy
begin;

create index if not exists push_deliveries_device_id_idx
  on public.push_deliveries(device_id);

drop policy if exists "users read own push devices" on public.push_devices;
drop policy if exists "admins read push devices" on public.push_devices;

create policy "users or admins read push devices" on public.push_devices
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
);

drop index if exists public.books_title_search_idx;

commit;
