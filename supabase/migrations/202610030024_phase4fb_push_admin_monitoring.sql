-- CHUONG Phase 4F-B: admin visibility for push health monitoring
begin;

grant select on public.push_devices to authenticated;
grant select on public.push_deliveries to authenticated;

drop policy if exists "admins read push devices" on public.push_devices;
create policy "admins read push devices" on public.push_devices
for select to authenticated
using ((select private.is_admin()));

drop policy if exists "admins read push deliveries" on public.push_deliveries;
create policy "admins read push deliveries" on public.push_deliveries
for select to authenticated
using ((select private.is_admin()));

create or replace function public.admin_get_push_runtime_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_job_id bigint;
  v_active boolean := false;
  v_status text;
  v_started_at timestamptz;
  v_ended_at timestamptz;
begin
  if not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode='42501';
  end if;

  select jobid, active into v_job_id, v_active
  from cron.job
  where jobname='chuong-push-dispatch'
  limit 1;

  if v_job_id is not null then
    select status, start_time, end_time
    into v_status, v_started_at, v_ended_at
    from cron.job_run_details
    where jobid=v_job_id
    order by start_time desc
    limit 1;
  end if;

  return jsonb_build_object(
    'cron_active', coalesce(v_active,false),
    'last_run_status', v_status,
    'last_run_started_at', v_started_at,
    'last_run_ended_at', v_ended_at
  );
end;
$$;

revoke execute on function public.admin_get_push_runtime_status() from public, anon;
grant execute on function public.admin_get_push_runtime_status() to authenticated;

commit;
