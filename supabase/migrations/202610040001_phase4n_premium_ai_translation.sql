-- CHƯƠNG Phase 4N: paid Premium gate + whole-book AI translation jobs
begin;

create table if not exists public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null default 'premium',
  status text not null default 'active',
  provider text,
  external_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_subscription_plan_check check (plan in ('premium')),
  constraint account_subscription_status_check check (status in ('trialing','active','past_due','cancelled','expired'))
);

create unique index if not exists account_subscriptions_user_active_uq
  on public.account_subscriptions(user_id)
  where status in ('trialing','active','past_due');

create unique index if not exists account_subscriptions_provider_external_uq
  on public.account_subscriptions(provider, external_subscription_id)
  where provider is not null and external_subscription_id is not null;

create index if not exists account_subscriptions_period_idx
  on public.account_subscriptions(status, current_period_end);

drop trigger if exists account_subscriptions_set_updated_at on public.account_subscriptions;
create trigger account_subscriptions_set_updated_at
before update on public.account_subscriptions
for each row execute function public.set_updated_at();

alter table public.account_subscriptions enable row level security;

drop policy if exists "users read own subscription" on public.account_subscriptions;
create policy "users read own subscription" on public.account_subscriptions
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "admins manage subscriptions" on public.account_subscriptions;
create policy "admins manage subscriptions" on public.account_subscriptions
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

grant select on public.account_subscriptions to authenticated;
grant insert, update, delete on public.account_subscriptions to authenticated;

create or replace function public.has_active_premium(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = p_user_id and p.role::text = 'admin'
    )
    or exists (
      select 1
      from public.account_subscriptions s
      where s.user_id = p_user_id
        and s.plan = 'premium'
        and s.status in ('trialing','active')
        and (s.current_period_end is null or s.current_period_end > now())
    );
$$;

revoke all on function public.has_active_premium(uuid) from public, anon;
grant execute on function public.has_active_premium(uuid) to authenticated, service_role;

create table if not exists public.ai_translation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  status text not null default 'queued',
  source_language text not null default 'auto',
  target_language text not null default 'vi',
  genre text not null,
  provider text,
  model text,
  total_chapters integer not null default 0 check (total_chapters >= 0),
  completed_chapters integer not null default 0 check (completed_chapters >= 0),
  last_chapter_number integer,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint ai_translation_job_status_check check (status in ('queued','processing','completed','failed','cancelled'))
);

create index if not exists ai_translation_jobs_user_created_idx
  on public.ai_translation_jobs(user_id, created_at desc);
create index if not exists ai_translation_jobs_book_created_idx
  on public.ai_translation_jobs(book_id, created_at desc);
create index if not exists ai_translation_jobs_status_idx
  on public.ai_translation_jobs(status, updated_at);

drop trigger if exists ai_translation_jobs_set_updated_at on public.ai_translation_jobs;
create trigger ai_translation_jobs_set_updated_at
before update on public.ai_translation_jobs
for each row execute function public.set_updated_at();

create table if not exists public.ai_translation_revisions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_translation_jobs(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  original_title text not null,
  original_content text not null,
  translated_title text not null,
  translated_content text not null,
  created_at timestamptz not null default now(),
  unique(job_id, chapter_id)
);

create index if not exists ai_translation_revisions_job_idx
  on public.ai_translation_revisions(job_id, created_at);
create index if not exists ai_translation_revisions_chapter_idx
  on public.ai_translation_revisions(chapter_id, created_at desc);

alter table public.ai_translation_jobs enable row level security;
alter table public.ai_translation_revisions enable row level security;

drop policy if exists "users read own ai translation jobs" on public.ai_translation_jobs;
create policy "users read own ai translation jobs" on public.ai_translation_jobs
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "users read own ai translation revisions" on public.ai_translation_revisions;
create policy "users read own ai translation revisions" on public.ai_translation_revisions
for select to authenticated
using (
  exists (
    select 1 from public.ai_translation_jobs j
    where j.id = job_id
      and (j.user_id = (select auth.uid()) or (select private.is_admin()))
  )
);

grant select on public.ai_translation_jobs to authenticated;
grant select on public.ai_translation_revisions to authenticated;

commit;
