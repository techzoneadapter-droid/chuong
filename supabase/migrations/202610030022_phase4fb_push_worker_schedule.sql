-- CHUONG Phase 4F-B: secure scheduled invocation for push-dispatch without storing secrets in git
begin;

create table if not exists private.push_worker_auth (
  singleton boolean primary key default true check (singleton),
  worker_secret text not null,
  created_at timestamptz not null default now()
);

revoke all on private.push_worker_auth from public, anon, authenticated;

do $$
declare
  v_secret text;
begin
  select worker_secret into v_secret
  from private.push_worker_auth
  where singleton = true;

  if v_secret is null then
    v_secret := encode(gen_random_bytes(32), 'hex');
    insert into private.push_worker_auth(singleton, worker_secret)
    values (true, v_secret)
    on conflict (singleton) do nothing;
  end if;

  if not exists (
    select 1 from vault.secrets where name = 'chuong_push_worker_secret'
  ) then
    perform vault.create_secret(v_secret, 'chuong_push_worker_secret');
  end if;

  if not exists (
    select 1 from vault.secrets where name = 'chuong_project_url'
  ) then
    perform vault.create_secret(
      'https://lwchpifeahyuoajeidsa.supabase.co',
      'chuong_project_url'
    );
  end if;
end $$;

create or replace function public.get_push_worker_secret()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select worker_secret
  from private.push_worker_auth
  where singleton = true;
$$;

revoke execute on function public.get_push_worker_secret() from public, anon, authenticated;
grant execute on function public.get_push_worker_secret() to service_role;

select cron.schedule(
  'chuong-push-dispatch',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'chuong_project_url'
      ) || '/functions/v1/push-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-chuong-push-worker', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'chuong_push_worker_secret'
        )
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 15000
    );
  $cron$
);

commit;
