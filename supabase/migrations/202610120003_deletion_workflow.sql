begin;
-- Never cascade financial records through profiles/auth or author/book deletion.
-- Keep the original identifiers until an approved retention/pseudonymization policy exists.
do $$ declare r record; begin
  for r in select c.conname,n.nspname,t.relname,pg_get_constraintdef(c.oid) as definition
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where c.contype='f' and c.confdeltype='c' and n.nspname='public'
      and t.relname in ('wallet_accounts','wallet_transactions','author_gifts','author_revenue_ledger','author_payouts')
  loop
    execute format('alter table %I.%I drop constraint %I',r.nspname,r.relname,r.conname);
    execute format('alter table %I.%I add constraint %I %s',r.nspname,r.relname,r.conname,replace(r.definition,'ON DELETE CASCADE','ON DELETE RESTRICT'));
  end loop;
end $$;
-- A deletion request must survive auth deletion for completion audit.
alter table public.account_deletion_requests drop constraint account_deletion_requests_user_id_fkey;
alter table public.account_deletion_requests drop constraint account_deletion_requests_status_check;
alter table public.account_deletion_requests add constraint account_deletion_requests_status_check
  check(status in ('pending','processing','blocked','completed'));
alter table public.account_deletion_requests
  add column policy_version text,
  add column lease_token uuid,
  add column lease_until timestamptz,
  add column completed_at timestamptz,
  add column updated_at timestamptz not null default now();
create table public.account_deletion_steps (
  request_id uuid not null references public.account_deletion_requests(id) on delete restrict,
  step text not null check(step in ('retention_review','wallet_and_payout_review','ugc_and_rights','personal_data','storage','devices_and_providers','auth_sessions','completion_notice')),
  evidence text not null check(length(btrim(evidence)) between 10 and 1000),
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  primary key(request_id,step)
);
alter table public.account_deletion_steps enable row level security;
revoke all on public.account_deletion_steps from public,anon,authenticated;
grant all on public.account_deletion_steps to service_role;
grant select on public.account_deletion_steps to authenticated;
create policy "admin deletion evidence" on public.account_deletion_steps for select to authenticated using((select private.is_admin()));
create policy "admin deletion queue" on public.account_deletion_requests for select to authenticated using((select private.is_admin()));

create function public.get_account_deletion_status() returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('id',id,'status',status,'requestedAt',requested_at,'completedAt',completed_at)
  from public.account_deletion_requests where user_id=(select auth.uid())
$$;
revoke all on function public.get_account_deletion_status() from public,anon;
grant execute on function public.get_account_deletion_status() to authenticated;

-- Lease token prevents stale/parallel operators from marking another worker's run complete.
create function public.admin_deletion_action(p_id uuid,p_action text,p_token uuid default null,p_step text default null,p_evidence text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.account_deletion_requests; v_count integer;
begin
  if (select auth.uid()) is null or not (select private.is_admin()) then raise exception 'Admin required' using errcode='42501'; end if;
  select * into v from public.account_deletion_requests where id=p_id for update;
  if v.id is null then raise exception 'Unknown request'; end if;
  if v.status='completed' and p_action in ('claim','complete') then return jsonb_build_object('id',v.id,'status',v.status); end if;
  if p_action='claim' then
    if v.status='completed' then return jsonb_build_object('id',v.id,'status',v.status); end if;
    if v.lease_until>now() then raise exception 'Already processing'; end if;
    update public.account_deletion_requests set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '30 minutes',updated_at=now() where id=p_id returning * into v;
  else
    if v.status<>'processing' or v.lease_token is distinct from p_token or v.lease_until<=now() then raise exception 'Invalid processing lease'; end if;
    if p_action='record' then
      insert into public.account_deletion_steps(request_id,step,evidence,recorded_by) values(p_id,p_step,p_evidence,(select auth.uid()))
        on conflict(request_id,step) do update set evidence=excluded.evidence,recorded_by=excluded.recorded_by,recorded_at=now();
    elsif p_action='complete' then
      select count(*) into v_count from public.account_deletion_steps where request_id=p_id;
      if v_count<>8 or v.policy_version is null then raise exception 'Approved policy and all eight evidence steps required'; end if;
      if exists(select 1 from auth.users where id=v.user_id) then raise exception 'Auth account still exists'; end if;
      update public.account_deletion_requests set status='completed',completed_at=now(),lease_token=null,lease_until=null,updated_at=now() where id=p_id returning * into v;
    elsif p_action='block' then
      update public.account_deletion_requests set status='blocked',lease_token=null,lease_until=null,updated_at=now() where id=p_id returning * into v;
    else raise exception 'Unknown action'; end if;
  end if;
  return jsonb_build_object('id',v.id,'status',v.status,'token',v.lease_token);
end $$;
revoke all on function public.admin_deletion_action(uuid,text,uuid,text,text) from public,anon;
grant execute on function public.admin_deletion_action(uuid,text,uuid,text,text) to authenticated;
-- policy_version is service-role only: admins cannot invent legal approval via UI.
create function public.admin_deletion_queue() returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not (select private.is_admin()) then raise exception 'Admin required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(row_to_json(q)) from (select id,user_id,status,requested_at,policy_version from public.account_deletion_requests order by requested_at limit 100) q),'[]'::jsonb);
end $$;
revoke all on function public.admin_deletion_queue() from public,anon;
grant execute on function public.admin_deletion_queue() to authenticated;
commit;
