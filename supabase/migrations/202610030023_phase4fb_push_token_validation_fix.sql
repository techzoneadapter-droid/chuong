-- CHUONG Phase 4F-B hotfix: robust Expo push token validation
create or replace function public.register_push_device(
  p_device_key text,
  p_expo_push_token text,
  p_platform text,
  p_project_id text,
  p_app_version text,
  p_device_label text
)
returns public.push_devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.push_devices%rowtype;
  v_token text := btrim(coalesce(p_expo_push_token, ''));
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_device_key is null or length(btrim(p_device_key)) < 8 then raise exception 'INVALID_DEVICE_KEY'; end if;
  if length(v_token) < 20
     or (
       v_token not like 'ExponentPushToken[%]%'
       and v_token not like 'ExpoPushToken[%]%'
     )
  then
    raise exception 'INVALID_EXPO_PUSH_TOKEN';
  end if;
  if p_platform not in ('android','ios') then raise exception 'INVALID_PUSH_PLATFORM'; end if;

  delete from public.push_devices d
  where d.expo_push_token = v_token
    and d.device_key <> btrim(p_device_key);

  insert into public.push_devices(
    user_id, device_key, expo_push_token, platform,
    project_id, app_version, device_label,
    enabled, last_seen_at, invalidated_at, invalidation_reason
  ) values (
    v_uid,
    btrim(p_device_key),
    v_token,
    p_platform,
    nullif(btrim(coalesce(p_project_id,'')), ''),
    nullif(btrim(coalesce(p_app_version,'')), ''),
    nullif(btrim(coalesce(p_device_label,'')), ''),
    true,
    now(),
    null,
    null
  )
  on conflict (device_key) do update
  set user_id = excluded.user_id,
      expo_push_token = excluded.expo_push_token,
      platform = excluded.platform,
      project_id = excluded.project_id,
      app_version = excluded.app_version,
      device_label = excluded.device_label,
      enabled = true,
      last_seen_at = now(),
      invalidated_at = null,
      invalidation_reason = null,
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.register_push_device(text,text,text,text,text,text) from public, anon;
grant execute on function public.register_push_device(text,text,text,text,text,text) to authenticated;
