begin;
-- No policy is activated by this migration. Owner-approved legal text must be supplied separately.
create table public.ugc_policy_versions (
  version text primary key check(length(version) between 1 and 80),
  terms_text text not null check(length(terms_text)>100),
  approved_by_owner_at timestamptz,
  active boolean not null default false,
  check(not active or approved_by_owner_at is not null)
);
create unique index one_active_ugc_policy on public.ugc_policy_versions(active) where active;
create function private.protect_approved_ugc_policy() returns trigger language plpgsql set search_path='' as $$
begin
  if old.approved_by_owner_at is not null and (new.version is distinct from old.version or new.terms_text is distinct from old.terms_text or new.approved_by_owner_at is distinct from old.approved_by_owner_at) then
    raise exception 'Approved policy text is immutable; publish a new version';
  end if;
  return new;
end $$;
create trigger protect_approved_ugc_policy before update on public.ugc_policy_versions for each row execute function private.protect_approved_ugc_policy();
revoke all on function private.protect_approved_ugc_policy() from public,anon,authenticated;
create table public.ugc_policy_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null references public.ugc_policy_versions(version) on delete restrict,
  accepted_at timestamptz not null default now(),
  primary key(user_id,version)
);
alter table public.ugc_policy_versions enable row level security;
alter table public.ugc_policy_acceptances enable row level security;
revoke all on public.ugc_policy_versions,public.ugc_policy_acceptances from public,anon,authenticated;
grant select on public.ugc_policy_versions to anon,authenticated;
grant select on public.ugc_policy_acceptances to authenticated;
grant all on public.ugc_policy_versions,public.ugc_policy_acceptances to service_role;
create policy "published policy" on public.ugc_policy_versions for select using(active and approved_by_owner_at is not null);
create policy "own policy acceptance" on public.ugc_policy_acceptances for select to authenticated using(user_id=(select auth.uid()));
create function public.get_active_ugc_policy() returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('version',p.version,'terms',p.terms_text,'accepted',exists(select 1 from public.ugc_policy_acceptances a where a.user_id=(select auth.uid()) and a.version=p.version))
  from public.ugc_policy_versions p where p.active and p.approved_by_owner_at is not null
$$;
revoke all on function public.get_active_ugc_policy() from public;
grant execute on function public.get_active_ugc_policy() to anon,authenticated;
create function public.accept_ugc_policy(p_version text) returns void language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.ugc_policy_versions where version=p_version and active and approved_by_owner_at is not null) then raise exception 'Policy not approved or outdated'; end if;
  insert into public.ugc_policy_acceptances(user_id,version) values((select auth.uid()),p_version) on conflict do nothing;
end $$;
revoke all on function public.accept_ugc_policy(text) from public,anon;
grant execute on function public.accept_ugc_policy(text) to authenticated;
create function private.require_ugc_policy() returns trigger language plpgsql security definer set search_path='' as $$
declare v_version text;
begin
  if tg_table_schema='storage' then
    if new.bucket_id not in ('profile-avatars','author-avatars','book-covers') then return new; end if;
  end if;
  select version into v_version from public.ugc_policy_versions where active and approved_by_owner_at is not null;
  if v_version is null then return new; end if; -- DRAFT cannot be treated as an approved contract.
  if coalesce((select auth.jwt())->>'role','')='service_role' then return new; end if;
  if not exists(select 1 from public.ugc_policy_acceptances where user_id=(select auth.uid()) and version=v_version) then
    raise exception 'Vui lòng mở Cài đặt > Điều khoản sử dụng và chấp nhận phiên bản hiện hành trước khi đăng nội dung.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.require_ugc_policy() from public,anon,authenticated;
do $$ declare v_table text; begin
  foreach v_table in array array['authors','books','chapters','comments','book_reviews'] loop
    if to_regclass('public.'||v_table) is not null then
      execute format('create trigger require_ugc_policy before insert or update on public.%I for each row execute function private.require_ugc_policy()',v_table);
    end if;
  end loop;
end $$;
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'create trigger require_ugc_policy before insert or update on storage.objects for each row execute function private.require_ugc_policy()';
  end if;
end $$;
commit;
