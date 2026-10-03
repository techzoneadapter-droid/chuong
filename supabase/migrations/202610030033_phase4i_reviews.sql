-- CHUONG Phase 4I: ratings, reviews, spoiler/helpful feedback and moderation integration
begin;

alter table public.books
  add column if not exists rating_count bigint not null default 0;

create table if not exists public.book_reviews (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null default '',
  spoiler boolean not null default false,
  helpful_count bigint not null default 0 check (helpful_count >= 0),
  moderation_state public.moderation_state not null default 'approved',
  moderation_note text,
  moderated_at timestamptz,
  moderated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint book_reviews_one_per_reader unique (user_id, book_id),
  constraint book_reviews_text_length check (char_length(review_text) <= 4000)
);

create table if not exists public.book_review_helpful (
  review_id uuid not null references public.book_reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create index if not exists book_reviews_book_visible_idx
  on public.book_reviews (book_id, moderation_state, created_at desc);
create index if not exists book_reviews_book_helpful_idx
  on public.book_reviews (book_id, moderation_state, helpful_count desc, created_at desc);
create index if not exists book_reviews_book_rating_idx
  on public.book_reviews (book_id, moderation_state, rating, created_at desc);
create index if not exists book_reviews_user_created_idx
  on public.book_reviews (user_id, created_at desc);
create index if not exists book_reviews_moderated_by_idx
  on public.book_reviews (moderated_by) where moderated_by is not null;
create index if not exists book_review_helpful_user_idx
  on public.book_review_helpful (user_id, created_at desc);

alter table public.reports
  add column if not exists review_id uuid references public.book_reviews(id) on delete cascade;

alter table public.reports drop constraint if exists reports_one_target;
alter table public.reports
  add constraint reports_one_target
  check (num_nonnulls(book_id, chapter_id, comment_id, author_id, review_id) = 1);

create index if not exists reports_review_idx
  on public.reports (review_id) where review_id is not null;

alter table public.moderation_actions
  drop constraint if exists moderation_actions_target_type_check;
alter table public.moderation_actions
  add constraint moderation_actions_target_type_check
  check (target_type in ('book','chapter','comment','author','review'));

create or replace function public.protect_book_rating_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rating is distinct from old.rating
     or new.rating_count is distinct from old.rating_count then
    if current_user not in ('postgres','supabase_admin','service_role') then
      raise exception 'Rating summary is system managed' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_book_rating_fields on public.books;
create trigger protect_book_rating_fields
before update on public.books
for each row execute function public.protect_book_rating_fields();

create or replace function public.validate_book_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean := coalesce((select private.is_admin()), false);
  v_is_own_book boolean;
  v_recent_count integer;
begin
  new.review_text := btrim(coalesce(new.review_text, ''));

  if current_user in ('postgres','supabase_admin','service_role') or v_is_admin then
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return new;
  end if;

  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  if tg_op = 'INSERT' then
    if new.user_id <> v_uid then
      raise exception 'Cannot create a review for another account' using errcode='42501';
    end if;

    select exists (
      select 1
      from public.books b
      join public.authors a on a.id=b.author_id
      where b.id=new.book_id and a.user_id=v_uid
    ) into v_is_own_book;

    if v_is_own_book then
      raise exception 'Authors cannot rate their own book' using errcode='42501';
    end if;

    select count(*) into v_recent_count
    from public.book_reviews r
    where r.user_id=v_uid
      and r.created_at > now() - interval '1 hour';

    if v_recent_count >= 10 then
      raise exception 'REVIEW_RATE_LIMIT' using errcode='P0001';
    end if;

    new.helpful_count := 0;
    new.moderation_state := 'approved';
    new.moderation_note := null;
    new.moderated_at := null;
    new.moderated_by := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if old.user_id <> v_uid then
    raise exception 'Cannot edit another review' using errcode='42501';
  end if;
  if new.user_id is distinct from old.user_id or new.book_id is distinct from old.book_id then
    raise exception 'Review ownership and book cannot be changed' using errcode='42501';
  end if;
  if now() - old.updated_at < interval '5 seconds' then
    raise exception 'REVIEW_EDIT_COOLDOWN' using errcode='P0001';
  end if;

  new.helpful_count := old.helpful_count;
  new.moderation_state := old.moderation_state;
  new.moderation_note := old.moderation_note;
  new.moderated_at := old.moderated_at;
  new.moderated_by := old.moderated_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_book_review on public.book_reviews;
create trigger validate_book_review
before insert or update on public.book_reviews
for each row execute function public.validate_book_review();

drop trigger if exists protect_book_review_moderation on public.book_reviews;
create trigger protect_book_review_moderation
before update on public.book_reviews
for each row execute function public.protect_moderation_fields();

create or replace function private.refresh_book_rating(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
  v_rating numeric(3,2);
begin
  select count(*), coalesce(round(avg(rating)::numeric, 2), 0)
    into v_count, v_rating
  from public.book_reviews
  where book_id=p_book_id
    and moderation_state='approved';

  update public.books
  set rating=v_rating,
      rating_count=v_count
  where id=p_book_id;
end;
$$;
revoke all on function private.refresh_book_rating(uuid) from public, anon, authenticated;

create or replace function public.book_reviews_refresh_rating_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_book_rating(old.book_id);
    return old;
  end if;

  perform private.refresh_book_rating(new.book_id);
  if tg_op = 'UPDATE' and old.book_id is distinct from new.book_id then
    perform private.refresh_book_rating(old.book_id);
  end if;
  return new;
end;
$$;

drop trigger if exists book_reviews_refresh_rating on public.book_reviews;
create trigger book_reviews_refresh_rating
after insert or update or delete on public.book_reviews
for each row execute function public.book_reviews_refresh_rating_trigger();

create or replace function private.refresh_review_helpful_count(p_review_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.book_reviews r
  set helpful_count=(
    select count(*)
    from public.book_review_helpful h
    where h.review_id=p_review_id
  )
  where r.id=p_review_id;
$$;
revoke all on function private.refresh_review_helpful_count(uuid) from public, anon, authenticated;

create or replace function public.review_helpful_refresh_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.refresh_review_helpful_count(coalesce(new.review_id, old.review_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists review_helpful_refresh on public.book_review_helpful;
create trigger review_helpful_refresh
after insert or delete on public.book_review_helpful
for each row execute function public.review_helpful_refresh_trigger();

alter table public.book_reviews enable row level security;
alter table public.book_review_helpful enable row level security;

drop policy if exists "visible book reviews are readable" on public.book_reviews;
create policy "visible book reviews are readable" on public.book_reviews
for select
using (
  (
    moderation_state='approved'
    and exists (
      select 1
      from public.books b
      join public.authors a on a.id=b.author_id
      where b.id=book_id
        and b.visibility='public'
        and b.status <> 'draft'
        and b.moderation_state='approved'
        and a.moderation_state='approved'
    )
  )
  or user_id=(select auth.uid())
  or exists (
    select 1
    from public.books b
    join public.authors a on a.id=b.author_id
    where b.id=book_id and a.user_id=(select auth.uid())
  )
  or (select private.is_admin())
);

drop policy if exists "users create own book review" on public.book_reviews;
create policy "users create own book review" on public.book_reviews
for insert to authenticated
with check (
  user_id=(select auth.uid())
  and exists (
    select 1
    from public.books b
    join public.authors a on a.id=b.author_id
    where b.id=book_id
      and b.visibility='public'
      and b.status <> 'draft'
      and b.moderation_state='approved'
      and a.moderation_state='approved'
      and a.user_id <> (select auth.uid())
  )
);

drop policy if exists "users update own review or admins moderate" on public.book_reviews;
create policy "users update own review or admins moderate" on public.book_reviews
for update to authenticated
using (user_id=(select auth.uid()) or (select private.is_admin()))
with check (user_id=(select auth.uid()) or (select private.is_admin()));

drop policy if exists "users delete own review" on public.book_reviews;
create policy "users delete own review" on public.book_reviews
for delete to authenticated
using (user_id=(select auth.uid()) or (select private.is_admin()));

drop policy if exists "users read own helpful votes" on public.book_review_helpful;
create policy "users read own helpful votes" on public.book_review_helpful
for select to authenticated
using (user_id=(select auth.uid()) or (select private.is_admin()));

drop policy if exists "users add helpful to visible reviews" on public.book_review_helpful;
create policy "users add helpful to visible reviews" on public.book_review_helpful
for insert to authenticated
with check (
  user_id=(select auth.uid())
  and exists (
    select 1 from public.book_reviews r
    where r.id=review_id
      and r.user_id <> (select auth.uid())
      and r.moderation_state='approved'
  )
);

drop policy if exists "users remove own helpful vote" on public.book_review_helpful;
create policy "users remove own helpful vote" on public.book_review_helpful
for delete to authenticated
using (user_id=(select auth.uid()) or (select private.is_admin()));

grant select on public.book_reviews to anon, authenticated;
grant insert, update, delete on public.book_reviews to authenticated;
grant select, insert, delete on public.book_review_helpful to authenticated;

create or replace function public.get_book_review_summary(p_book_id uuid)
returns table(
  average_rating numeric,
  rating_count bigint,
  star_5 bigint,
  star_4 bigint,
  star_3 bigint,
  star_2 bigint,
  star_1 bigint,
  my_review_id uuid,
  my_rating smallint,
  my_review_text text,
  my_spoiler boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with agg as (
    select
      coalesce(round(avg(r.rating)::numeric,2),0) as average_rating,
      count(*)::bigint as rating_count,
      count(*) filter (where r.rating=5)::bigint as star_5,
      count(*) filter (where r.rating=4)::bigint as star_4,
      count(*) filter (where r.rating=3)::bigint as star_3,
      count(*) filter (where r.rating=2)::bigint as star_2,
      count(*) filter (where r.rating=1)::bigint as star_1
    from public.book_reviews r
    where r.book_id=p_book_id and r.moderation_state='approved'
  ),
  mine as (
    select r.id,r.rating,r.review_text,r.spoiler
    from public.book_reviews r
    where r.book_id=p_book_id and r.user_id=(select auth.uid())
    limit 1
  )
  select
    a.average_rating,
    a.rating_count,
    a.star_5,
    a.star_4,
    a.star_3,
    a.star_2,
    a.star_1,
    m.id,
    m.rating,
    m.review_text,
    m.spoiler
  from agg a
  left join mine m on true;
$$;

revoke execute on function public.get_book_review_summary(uuid) from public;
grant execute on function public.get_book_review_summary(uuid) to anon, authenticated;

create or replace function public.admin_set_moderation(
  p_target_type text,
  p_target_id uuid,
  p_state public.moderation_state,
  p_reason text default null,
  p_report_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_action text;
begin
  if v_admin is null or not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_target_type not in ('book','chapter','comment','author','review') then
    raise exception 'Unsupported moderation target';
  end if;

  v_action := case p_state when 'approved' then 'approve' when 'hidden' then 'hide' else 'reject' end;

  if p_target_type='book' then
    update public.books
      set moderation_state=p_state, moderation_note=nullif(btrim(p_reason),''), moderated_at=now(), moderated_by=v_admin
      where id=p_target_id;
  elsif p_target_type='chapter' then
    update public.chapters
      set moderation_state=p_state, moderation_note=nullif(btrim(p_reason),''), moderated_at=now(), moderated_by=v_admin
      where id=p_target_id;
  elsif p_target_type='comment' then
    update public.comments
      set moderation_state=p_state, moderation_note=nullif(btrim(p_reason),''), moderated_at=now(), moderated_by=v_admin
      where id=p_target_id;
  elsif p_target_type='review' then
    update public.book_reviews
      set moderation_state=p_state, moderation_note=nullif(btrim(p_reason),''), moderated_at=now(), moderated_by=v_admin
      where id=p_target_id;
  else
    update public.authors
      set moderation_state=p_state, moderation_note=nullif(btrim(p_reason),''), moderated_at=now(), moderated_by=v_admin
      where id=p_target_id;
  end if;

  if not found then raise exception 'Moderation target not found'; end if;

  insert into public.moderation_actions(admin_id,target_type,target_id,action,reason,report_id)
  values (v_admin,p_target_type,p_target_id,v_action,nullif(btrim(p_reason),''),p_report_id);
end;
$$;

create or replace function public.admin_update_report(
  p_report_id uuid,
  p_status public.report_status,
  p_resolution_note text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_report public.reports%rowtype;
begin
  if v_admin is null or not (select private.is_admin()) then
    raise exception 'Admin access required' using errcode='42501';
  end if;

  update public.reports
    set status=p_status,
        assigned_admin_id=v_admin,
        resolution_note=nullif(btrim(p_resolution_note),''),
        updated_at=now()
    where id=p_report_id
    returning * into v_report;

  if not found then raise exception 'Report not found'; end if;

  if p_status in ('resolved','rejected') then
    insert into public.moderation_actions(
      admin_id,target_type,target_id,action,reason,report_id
    )
    values (
      v_admin,
      case
        when v_report.book_id is not null then 'book'
        when v_report.chapter_id is not null then 'chapter'
        when v_report.comment_id is not null then 'comment'
        when v_report.review_id is not null then 'review'
        else 'author'
      end,
      coalesce(v_report.book_id,v_report.chapter_id,v_report.comment_id,v_report.review_id,v_report.author_id),
      case when p_status='resolved' then 'resolve_report' else 'reject_report' end,
      nullif(btrim(p_resolution_note),''),
      p_report_id
    );
  end if;
end;
$$;

revoke execute on function public.admin_set_moderation(text,uuid,public.moderation_state,text,uuid) from public, anon;
grant execute on function public.admin_set_moderation(text,uuid,public.moderation_state,text,uuid) to authenticated;
revoke execute on function public.admin_update_report(uuid,public.report_status,text) from public, anon;
grant execute on function public.admin_update_report(uuid,public.report_status,text) to authenticated;

-- Recalculate legacy rating values from the new canonical review table.
do $$
declare v_book uuid;
begin
  for v_book in select id from public.books loop
    perform private.refresh_book_rating(v_book);
  end loop;
end $$;

commit;
