-- CHUONG Phase 4F-B: native push device registry and durable delivery queue
begin;

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_key text not null unique,
  expo_push_token text not null unique,
  platform text not null check (platform in ('android','ios')),
  project_id text,
  app_version text,
  device_label text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_devices_key_len check (char_length(device_key) between 8 and 200),
  constraint push_devices_token_len check (char_length(expo_push_token) between 20 and 300),
  constraint push_devices_project_len check (project_id is null or char_length(project_id) <= 120),
  constraint push_devices_version_len check (app_version is null or char_length(app_version) <= 80),
  constraint push_devices_label_len check (device_label is null or char_length(device_label) <= 160)
);

drop trigger if exists push_devices_set_updated_at on public.push_devices;
create trigger push_devices_set_updated_at
before update on public.push_devices
for each row execute function public.set_updated_at();

create index if not exists push_devices_user_enabled_idx
  on public.push_devices(user_id, enabled)
  where enabled = true;

alter table public.push_devices enable row level security;

drop policy if exists "users read own push devices" on public.push_devices;
create policy "users read own push devices" on public.push_devices
for select to authenticated
using (user_id = (select auth.uid()));

grant select on public.push_devices to authenticated;
revoke insert, update, delete on public.push_devices from authenticated;

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  device_id uuid not null references public.push_devices(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','processing','ticketed','delivered','failed','invalid_token')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  ticket_id text,
  ticket_error_code text,
  ticket_error_message text,
  sent_at timestamptz,
  receipt_checked_at timestamptz,
  receipt_status text,
  receipt_error_code text,
  receipt_error_message text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id, device_id)
);

drop trigger if exists push_deliveries_set_updated_at on public.push_deliveries;
create trigger push_deliveries_set_updated_at
before update on public.push_deliveries
for each row execute function public.set_updated_at();

create index if not exists push_deliveries_dispatch_idx
  on public.push_deliveries(status, next_attempt_at, created_at)
  where status in ('pending','processing');

create index if not exists push_deliveries_receipt_idx
  on public.push_deliveries(sent_at)
  where status = 'ticketed' and receipt_checked_at is null;

alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;

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
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_device_key is null or length(btrim(p_device_key)) < 8 then raise exception 'INVALID_DEVICE_KEY'; end if;
  if p_expo_push_token is null
     or length(btrim(p_expo_push_token)) < 20
     or btrim(p_expo_push_token) !~ '^(ExponentPushToken|ExpoPushToken)\\['
  then
    raise exception 'INVALID_EXPO_PUSH_TOKEN';
  end if;
  if p_platform not in ('android','ios') then raise exception 'INVALID_PUSH_PLATFORM'; end if;

  delete from public.push_devices d
  where d.expo_push_token = btrim(p_expo_push_token)
    and d.device_key <> btrim(p_device_key);

  insert into public.push_devices(
    user_id, device_key, expo_push_token, platform,
    project_id, app_version, device_label,
    enabled, last_seen_at, invalidated_at, invalidation_reason
  ) values (
    v_uid,
    btrim(p_device_key),
    btrim(p_expo_push_token),
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

create or replace function public.unregister_push_device(
  p_device_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  update public.push_devices d
  set enabled = false,
      invalidated_at = now(),
      invalidation_reason = 'user_disabled',
      updated_at = now()
  where d.device_key = btrim(p_device_key)
    and d.user_id = (select auth.uid());

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke execute on function public.unregister_push_device(text) from public, anon;
grant execute on function public.unregister_push_device(text) to authenticated;

create or replace function public.unregister_all_push_devices()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  update public.push_devices d
  set enabled = false,
      invalidated_at = now(),
      invalidation_reason = 'user_disabled_all',
      updated_at = now()
  where d.user_id = (select auth.uid())
    and d.enabled = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.unregister_all_push_devices() from public, anon;
grant execute on function public.unregister_all_push_devices() to authenticated;

create or replace function private.push_category_enabled(
  p_user_id uuid,
  p_category text
)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_pref public.notification_preferences%rowtype;
begin
  if p_user_id is null then return false; end if;

  select * into v_pref
  from public.notification_preferences p
  where p.user_id = p_user_id;

  if not found or not v_pref.push_enabled then return false; end if;

  return case p_category
    when 'purchase' then v_pref.purchases
    when 'author_earnings' then v_pref.author_earnings
    when 'payout' then v_pref.payouts
    when 'comment' then v_pref.comments
    when 'moderation' then v_pref.moderation
    when 'system' then v_pref.system
    else true
  end;
end;
$$;

revoke execute on function private.push_category_enabled(uuid,text) from public, anon, authenticated;

create or replace function private.queue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.push_category_enabled(new.user_id, new.category) then
    return new;
  end if;

  insert into public.push_deliveries(notification_id, device_id)
  select new.id, d.id
  from public.push_devices d
  where d.user_id = new.user_id
    and d.enabled = true
    and d.invalidated_at is null
  on conflict (notification_id, device_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists queue_notification_push_insert on public.notifications;
create trigger queue_notification_push_insert
after insert on public.notifications
for each row execute function private.queue_notification_push();

create or replace function public.claim_push_deliveries(
  p_limit integer default 100
)
returns table(
  delivery_id uuid,
  notification_id uuid,
  device_id uuid,
  user_id uuid,
  expo_push_token text,
  title text,
  body text,
  action_route text,
  category text,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;

  update public.push_deliveries d
  set status = 'pending',
      locked_at = null,
      next_attempt_at = least(d.next_attempt_at, now()),
      updated_at = now()
  where d.status = 'processing'
    and d.locked_at < now() - interval '5 minutes';

  return query
  with candidates as (
    select d.id
    from public.push_deliveries d
    join public.push_devices dev on dev.id = d.device_id
    where d.status = 'pending'
      and d.next_attempt_at <= now()
      and d.attempts < 6
      and dev.enabled = true
      and dev.invalidated_at is null
    order by d.created_at
    for update of d skip locked
    limit greatest(1, least(coalesce(p_limit,100),100))
  ),
  claimed as (
    update public.push_deliveries d
    set status = 'processing',
        attempts = d.attempts + 1,
        locked_at = now(),
        updated_at = now()
    from candidates c
    where d.id = c.id
    returning d.*
  )
  select
    c.id,
    c.notification_id,
    c.device_id,
    n.user_id,
    dev.expo_push_token,
    n.title,
    n.body,
    n.action_route,
    n.category,
    c.attempts
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.push_devices dev on dev.id = c.device_id;
end;
$$;

revoke execute on function public.claim_push_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;

commit;
