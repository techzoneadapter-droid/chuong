-- Request intake only. Apply to staging first; never claims that deletion is complete.
begin;
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','processing'))
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;
create policy "read own deletion request" on public.account_deletion_requests
  for select to authenticated using (user_id = (select auth.uid()));

create function public.request_account_deletion()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_request public.account_deletion_requests;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.account_deletion_requests (user_id) values (v_uid)
    on conflict (user_id) do nothing;
  select * into v_request from public.account_deletion_requests where user_id = v_uid;
  return jsonb_build_object('id', v_request.id, 'requestedAt', v_request.requested_at, 'status', v_request.status);
end;
$$;
revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
commit;
