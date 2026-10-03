-- CHUONG Phase 4E: author payout requests, compliance placeholders and admin settlement workflow
begin;

create table if not exists public.author_payout_profiles (
  author_id uuid primary key references public.authors(id) on delete cascade,
  payout_method text not null default 'manual',
  destination_label text,
  kyc_status text not null default 'not_submitted'
    check (kyc_status in ('not_submitted','pending','verified','rejected')),
  tax_status text not null default 'not_submitted'
    check (tax_status in ('not_submitted','pending','verified','rejected','not_required')),
  compliance_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint author_payout_profiles_method_nonblank check (length(btrim(payout_method)) between 2 and 40),
  constraint author_payout_profiles_destination_len check (destination_label is null or char_length(destination_label) <= 160),
  constraint author_payout_profiles_note_len check (compliance_note is null or char_length(compliance_note) <= 1000)
);

create index if not exists author_payout_profiles_reviewed_by_idx
  on public.author_payout_profiles(reviewed_by)
  where reviewed_by is not null;

drop trigger if exists author_payout_profiles_set_updated_at on public.author_payout_profiles;
create trigger author_payout_profiles_set_updated_at
before update on public.author_payout_profiles
for each row execute function public.set_updated_at();

alter table public.author_payout_profiles enable row level security;

drop policy if exists "authors read own payout profile" on public.author_payout_profiles;
create policy "authors read own payout profile" on public.author_payout_profiles
for select to authenticated
using (
  exists (
    select 1 from public.authors a
    where a.id = author_payout_profiles.author_id
      and a.user_id = (select auth.uid())
  )
  or (select private.is_admin())
);

grant select on public.author_payout_profiles to authenticated;
revoke insert, update, delete on public.author_payout_profiles from authenticated;

alter table public.author_payouts
  add column if not exists requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists review_note text,
  add column if not exists request_snapshot jsonb not null default '{}'::jsonb;

alter table public.author_payouts
  drop constraint if exists author_payouts_review_note_len;
alter table public.author_payouts
  add constraint author_payouts_review_note_len
  check (review_note is null or char_length(review_note) <= 1000);

create index if not exists author_payouts_status_requested_idx
  on public.author_payouts(status, requested_at desc);

create index if not exists author_payouts_requested_by_idx
  on public.author_payouts(requested_by)
  where requested_by is not null;

create index if not exists author_payouts_reviewed_by_idx
  on public.author_payouts(reviewed_by)
  where reviewed_by is not null;

revoke insert, update, delete on public.author_payouts from authenticated;
grant select on public.author_payouts to authenticated;

create or replace function public.author_update_payout_profile(
  p_payout_method text,
  p_destination_label text
)
returns public.author_payout_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author public.authors%rowtype;
  v_profile public.author_payout_profiles%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_payout_method is null or length(btrim(p_payout_method)) < 2 then
    raise exception 'PAYOUT_METHOD_REQUIRED';
  end if;
  if p_destination_label is null or length(btrim(p_destination_label)) < 3 then
    raise exception 'PAYOUT_DESTINATION_REQUIRED';
  end if;

  select * into v_author
  from public.authors a
  where a.user_id = v_uid;

  if not found then raise exception 'AUTHOR_PROFILE_REQUIRED'; end if;

  insert into public.author_payout_profiles(author_id, payout_method, destination_label)
  values (v_author.id, btrim(p_payout_method), btrim(p_destination_label))
  on conflict (author_id) do update
    set payout_method = excluded.payout_method,
        destination_label = excluded.destination_label,
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke execute on function public.author_update_payout_profile(text,text) from public, anon;
grant execute on function public.author_update_payout_profile(text,text) to authenticated;

create or replace function public.author_request_payout(
  p_amount_coins bigint,
  p_note text,
  p_idempotency_key text
)
returns public.author_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author public.authors%rowtype;
  v_account public.author_revenue_accounts%rowtype;
  v_profile public.author_payout_profiles%rowtype;
  v_existing public.author_payouts%rowtype;
  v_payout public.author_payouts%rowtype;
  v_reserved bigint := 0;
  v_available bigint := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_amount_coins is null or p_amount_coins <= 0 then raise exception 'INVALID_PAYOUT_AMOUNT'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_author
  from public.authors a
  where a.user_id = v_uid;

  if not found then raise exception 'AUTHOR_PROFILE_REQUIRED'; end if;

  select * into v_existing
  from public.author_payouts p
  where p.idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing.author_id <> v_author.id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_existing;
  end if;

  select * into v_account
  from public.author_revenue_accounts a
  where a.author_id = v_author.id
  for update;

  if not found then raise exception 'AUTHOR_REVENUE_ACCOUNT_NOT_FOUND'; end if;

  select coalesce(sum(p.amount_coins),0) into v_reserved
  from public.author_payouts p
  where p.author_id = v_author.id
    and p.status in ('pending','approved');

  v_available := greatest(
    0,
    v_account.author_earnings_coins
      - v_account.refunded_earnings_coins
      - v_account.paid_out_coins
      - v_reserved
  );

  if p_amount_coins > v_available then raise exception 'INSUFFICIENT_REQUESTABLE_EARNINGS'; end if;

  insert into public.author_payout_profiles(author_id)
  values (v_author.id)
  on conflict (author_id) do nothing;

  select * into v_profile
  from public.author_payout_profiles p
  where p.author_id = v_author.id;

  insert into public.author_payouts(
    author_id,
    amount_coins,
    status,
    note,
    idempotency_key,
    requested_at,
    requested_by,
    request_snapshot
  ) values (
    v_author.id,
    p_amount_coins,
    'pending',
    nullif(btrim(coalesce(p_note,'')), ''),
    btrim(p_idempotency_key),
    now(),
    v_uid,
    jsonb_build_object(
      'payout_method', v_profile.payout_method,
      'destination_label', v_profile.destination_label,
      'kyc_status', v_profile.kyc_status,
      'tax_status', v_profile.tax_status
    )
  )
  returning * into v_payout;

  return v_payout;
end;
$$;

revoke execute on function public.author_request_payout(bigint,text,text) from public, anon;
grant execute on function public.author_request_payout(bigint,text,text) to authenticated;

create or replace function public.author_cancel_payout_request(
  p_payout_id uuid
)
returns public.author_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_author_id uuid;
  v_payout public.author_payouts%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  select a.id into v_author_id
  from public.authors a
  where a.user_id = v_uid;

  if v_author_id is null then raise exception 'AUTHOR_PROFILE_REQUIRED'; end if;

  select * into v_payout
  from public.author_payouts p
  where p.id = p_payout_id
  for update;

  if not found or v_payout.author_id <> v_author_id then raise exception 'PAYOUT_REQUEST_NOT_FOUND'; end if;
  if v_payout.status <> 'pending' then raise exception 'ONLY_PENDING_REQUEST_CAN_BE_CANCELLED'; end if;

  update public.author_payouts p
  set status = 'cancelled',
      reviewed_at = now(),
      review_note = coalesce(p.review_note, 'Tác giả đã hủy yêu cầu')
  where p.id = p_payout_id
  returning * into v_payout;

  return v_payout;
end;
$$;

revoke execute on function public.author_cancel_payout_request(uuid) from public, anon;
grant execute on function public.author_cancel_payout_request(uuid) to authenticated;

create or replace function public.admin_set_author_payout_compliance(
  p_author_id uuid,
  p_kyc_status text,
  p_tax_status text,
  p_note text
)
returns public.author_payout_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.author_payout_profiles%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_kyc_status not in ('not_submitted','pending','verified','rejected') then
    raise exception 'INVALID_KYC_STATUS';
  end if;
  if p_tax_status not in ('not_submitted','pending','verified','rejected','not_required') then
    raise exception 'INVALID_TAX_STATUS';
  end if;

  insert into public.author_payout_profiles(
    author_id, kyc_status, tax_status, compliance_note, reviewed_at, reviewed_by
  ) values (
    p_author_id, p_kyc_status, p_tax_status, nullif(btrim(coalesce(p_note,'')), ''), now(), (select auth.uid())
  )
  on conflict (author_id) do update
    set kyc_status = excluded.kyc_status,
        tax_status = excluded.tax_status,
        compliance_note = excluded.compliance_note,
        reviewed_at = now(),
        reviewed_by = (select auth.uid()),
        updated_at = now()
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke execute on function public.admin_set_author_payout_compliance(uuid,text,text,text) from public, anon;
grant execute on function public.admin_set_author_payout_compliance(uuid,text,text,text) to authenticated;

create or replace function public.admin_review_payout_request(
  p_payout_id uuid,
  p_action text,
  p_note text
)
returns public.author_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.author_payouts%rowtype;
  v_profile public.author_payout_profiles%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_action not in ('approve','cancel') then raise exception 'INVALID_PAYOUT_REVIEW_ACTION'; end if;

  select * into v_payout
  from public.author_payouts p
  where p.id = p_payout_id
  for update;

  if not found then raise exception 'PAYOUT_REQUEST_NOT_FOUND'; end if;

  if p_action = 'approve' then
    if v_payout.status = 'approved' then return v_payout; end if;
    if v_payout.status <> 'pending' then raise exception 'PAYOUT_NOT_PENDING'; end if;

    select * into v_profile
    from public.author_payout_profiles p
    where p.author_id = v_payout.author_id;

    if not found then raise exception 'PAYOUT_PROFILE_REQUIRED'; end if;
    if v_profile.kyc_status <> 'verified' then raise exception 'KYC_NOT_VERIFIED'; end if;
    if v_profile.tax_status not in ('verified','not_required') then raise exception 'TAX_STATUS_NOT_READY'; end if;
    if v_profile.destination_label is null or length(btrim(v_profile.destination_label)) < 3 then
      raise exception 'PAYOUT_DESTINATION_REQUIRED';
    end if;

    update public.author_payouts p
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = (select auth.uid()),
        review_note = nullif(btrim(coalesce(p_note,'')), '')
    where p.id = p_payout_id
    returning * into v_payout;
  else
    if v_payout.status = 'cancelled' then return v_payout; end if;
    if v_payout.status not in ('pending','approved') then raise exception 'PAYOUT_CANNOT_BE_CANCELLED'; end if;

    update public.author_payouts p
    set status = 'cancelled',
        reviewed_at = now(),
        reviewed_by = (select auth.uid()),
        review_note = nullif(btrim(coalesce(p_note,'')), '')
    where p.id = p_payout_id
    returning * into v_payout;
  end if;

  return v_payout;
end;
$$;

revoke execute on function public.admin_review_payout_request(uuid,text,text) from public, anon;
grant execute on function public.admin_review_payout_request(uuid,text,text) to authenticated;

create or replace function public.admin_mark_payout_paid(
  p_payout_id uuid,
  p_external_reference text,
  p_note text
)
returns public.author_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.author_payouts%rowtype;
  v_account public.author_revenue_accounts%rowtype;
  v_available bigint;
begin
  if not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_external_reference is null or length(btrim(p_external_reference)) < 3 then
    raise exception 'EXTERNAL_REFERENCE_REQUIRED';
  end if;

  select * into v_payout
  from public.author_payouts p
  where p.id = p_payout_id
  for update;

  if not found then raise exception 'PAYOUT_REQUEST_NOT_FOUND'; end if;
  if v_payout.status = 'paid' then return v_payout; end if;
  if v_payout.status <> 'approved' then raise exception 'PAYOUT_NOT_APPROVED'; end if;

  select * into v_account
  from public.author_revenue_accounts a
  where a.author_id = v_payout.author_id
  for update;

  if not found then raise exception 'AUTHOR_REVENUE_ACCOUNT_NOT_FOUND'; end if;

  v_available := greatest(
    0,
    v_account.author_earnings_coins
      - v_account.refunded_earnings_coins
      - v_account.paid_out_coins
  );

  if v_available < v_payout.amount_coins then
    raise exception 'INSUFFICIENT_AUTHOR_EARNINGS_AT_SETTLEMENT';
  end if;

  update public.author_revenue_accounts a
  set paid_out_coins = a.paid_out_coins + v_payout.amount_coins,
      updated_at = now()
  where a.author_id = v_payout.author_id;

  update public.author_payouts p
  set status = 'paid',
      external_reference = btrim(p_external_reference),
      note = coalesce(nullif(btrim(coalesce(p_note,'')), ''), p.note),
      processed_at = now(),
      processed_by = (select auth.uid())
  where p.id = p_payout_id
  returning * into v_payout;

  return v_payout;
end;
$$;

revoke execute on function public.admin_mark_payout_paid(uuid,text,text) from public, anon;
grant execute on function public.admin_mark_payout_paid(uuid,text,text) to authenticated;

commit;
