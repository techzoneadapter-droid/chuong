-- CHUONG Phase 4K: reader social/community with privacy-safe public activity
begin;

create table if not exists public.reader_privacy (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  profile_public boolean not null default true,
  show_shelves boolean not null default true,
  show_reviews boolean not null default true,
  show_comments boolean not null default true,
  allow_follows boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reader_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint reader_follows_not_self check (follower_id <> following_id)
);

create table if not exists public.reader_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint reader_blocks_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.reader_mutes (
  muter_id uuid not null references public.profiles(id) on delete cascade,
  muted_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  constraint reader_mutes_not_self check (muter_id <> muted_id)
);

create index if not exists reader_follows_following_created_idx
  on public.reader_follows (following_id, created_at desc);

create index if not exists reader_blocks_blocked_idx
  on public.reader_blocks (blocked_id);

create index if not exists reader_mutes_muted_idx
  on public.reader_mutes (muted_id);

create index if not exists book_reviews_user_created_approved_idx
  on public.book_reviews (user_id, created_at desc)
  where moderation_state = 'approved';

create index if not exists comments_user_created_approved_idx
  on public.comments (user_id, created_at desc)
  where moderation_state = 'approved';

alter table public.reader_privacy enable row level security;
alter table public.reader_follows enable row level security;
alter table public.reader_blocks enable row level security;
alter table public.reader_mutes enable row level security;

grant select, insert, update, delete on public.reader_privacy to authenticated, service_role;
grant select, insert, update, delete on public.reader_follows to authenticated, service_role;
grant select, insert, update, delete on public.reader_blocks to authenticated, service_role;
grant select, insert, update, delete on public.reader_mutes to authenticated, service_role;
revoke all on public.reader_privacy from anon;
revoke all on public.reader_follows from anon;
revoke all on public.reader_blocks from anon;
revoke all on public.reader_mutes from anon;

create or replace function private.reader_has_block(p_blocker uuid, p_blocked uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_blocker is null or p_blocked is null then false
    else exists (
      select 1
      from public.reader_blocks rb
      where rb.blocker_id = p_blocker
        and rb.blocked_id = p_blocked
    )
  end;
$$;

create or replace function private.readers_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_a is null or p_b is null then false
    else private.reader_has_block(p_a, p_b) or private.reader_has_block(p_b, p_a)
  end;
$$;

create or replace function private.reader_can_follow(p_actor uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_actor is not null
    and p_target is not null
    and p_actor <> p_target
    and exists (select 1 from public.profiles p where p.id = p_target)
    and coalesce((select rp.profile_public from public.reader_privacy rp where rp.user_id = p_target), true)
    and coalesce((select rp.allow_follows from public.reader_privacy rp where rp.user_id = p_target), true)
    and not private.readers_blocked(p_actor, p_target);
$$;

revoke all on function private.reader_has_block(uuid, uuid) from public;
revoke all on function private.readers_blocked(uuid, uuid) from public;
revoke all on function private.reader_can_follow(uuid, uuid) from public;

drop policy if exists "users read own reader privacy" on public.reader_privacy;
create policy "users read own reader privacy"
on public.reader_privacy
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users create own reader privacy" on public.reader_privacy;
create policy "users create own reader privacy"
on public.reader_privacy
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users update own reader privacy" on public.reader_privacy;
create policy "users update own reader privacy"
on public.reader_privacy
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "follow participants can read relationship" on public.reader_follows;
create policy "follow participants can read relationship"
on public.reader_follows
for select to authenticated
using ((select auth.uid()) in (follower_id, following_id));

drop policy if exists "users follow from own account" on public.reader_follows;
create policy "users follow from own account"
on public.reader_follows
for insert to authenticated
with check (
  (select auth.uid()) = follower_id
  and private.reader_can_follow((select auth.uid()), following_id)
);

drop policy if exists "users unfollow from own account" on public.reader_follows;
create policy "users unfollow from own account"
on public.reader_follows
for delete to authenticated
using ((select auth.uid()) = follower_id);

drop policy if exists "users read own blocks" on public.reader_blocks;
create policy "users read own blocks"
on public.reader_blocks
for select to authenticated
using ((select auth.uid()) = blocker_id);

drop policy if exists "users create own blocks" on public.reader_blocks;
create policy "users create own blocks"
on public.reader_blocks
for insert to authenticated
with check ((select auth.uid()) = blocker_id);

drop policy if exists "users delete own blocks" on public.reader_blocks;
create policy "users delete own blocks"
on public.reader_blocks
for delete to authenticated
using ((select auth.uid()) = blocker_id);

drop policy if exists "users read own mutes" on public.reader_mutes;
create policy "users read own mutes"
on public.reader_mutes
for select to authenticated
using ((select auth.uid()) = muter_id);

drop policy if exists "users create own mutes" on public.reader_mutes;
create policy "users create own mutes"
on public.reader_mutes
for insert to authenticated
with check ((select auth.uid()) = muter_id);

drop policy if exists "users delete own mutes" on public.reader_mutes;
create policy "users delete own mutes"
on public.reader_mutes
for delete to authenticated
using ((select auth.uid()) = muter_id);

drop trigger if exists reader_privacy_set_updated_at on public.reader_privacy;
create trigger reader_privacy_set_updated_at
before update on public.reader_privacy
for each row execute function public.set_updated_at();

create or replace function private.ensure_reader_privacy_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.reader_privacy (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.ensure_reader_privacy_row() from public;

drop trigger if exists ensure_reader_privacy_after_profile on public.profiles;
create trigger ensure_reader_privacy_after_profile
after insert on public.profiles
for each row execute function private.ensure_reader_privacy_row();

insert into public.reader_privacy (user_id)
select p.id
from public.profiles p
on conflict (user_id) do nothing;

create or replace function private.cleanup_reader_block_relationships()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.reader_follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);

  delete from public.reader_mutes
  where muter_id = new.blocker_id and muted_id = new.blocked_id;

  return new;
end;
$$;

revoke all on function private.cleanup_reader_block_relationships() from public;

drop trigger if exists cleanup_reader_block_relationships on public.reader_blocks;
create trigger cleanup_reader_block_relationships
after insert on public.reader_blocks
for each row execute function private.cleanup_reader_block_relationships();

create or replace function public.get_my_reader_privacy()
returns table (
  user_id uuid,
  profile_public boolean,
  show_shelves boolean,
  show_reviews boolean,
  show_comments boolean,
  allow_follows boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.reader_privacy (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  return query
  select rp.user_id, rp.profile_public, rp.show_shelves, rp.show_reviews,
         rp.show_comments, rp.allow_follows, rp.created_at, rp.updated_at
  from public.reader_privacy rp
  where rp.user_id = v_user;
end;
$$;

create or replace function public.update_reader_privacy(
  p_profile_public boolean,
  p_show_shelves boolean,
  p_show_reviews boolean,
  p_show_comments boolean,
  p_allow_follows boolean
)
returns table (
  user_id uuid,
  profile_public boolean,
  show_shelves boolean,
  show_reviews boolean,
  show_comments boolean,
  allow_follows boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.reader_privacy (
    user_id, profile_public, show_shelves, show_reviews, show_comments, allow_follows
  )
  values (
    v_user, p_profile_public, p_show_shelves, p_show_reviews, p_show_comments, p_allow_follows
  )
  on conflict (user_id) do update
  set profile_public = excluded.profile_public,
      show_shelves = excluded.show_shelves,
      show_reviews = excluded.show_reviews,
      show_comments = excluded.show_comments,
      allow_follows = excluded.allow_follows,
      updated_at = now();

  if not p_allow_follows then
    delete from public.reader_follows where following_id = v_user;
  end if;

  return query
  select rp.user_id, rp.profile_public, rp.show_shelves, rp.show_reviews,
         rp.show_comments, rp.allow_follows, rp.created_at, rp.updated_at
  from public.reader_privacy rp
  where rp.user_id = v_user;
end;
$$;

create or replace function public.set_reader_follow(p_target_id uuid, p_following boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_target_id is null or p_target_id = v_user then
    raise exception 'INVALID_FOLLOW_TARGET';
  end if;

  if p_following then
    if not private.reader_can_follow(v_user, p_target_id) then
      raise exception 'FOLLOW_NOT_ALLOWED';
    end if;

    insert into public.reader_follows (follower_id, following_id)
    values (v_user, p_target_id)
    on conflict do nothing;
    return true;
  end if;

  delete from public.reader_follows
  where follower_id = v_user and following_id = p_target_id;
  return false;
end;
$$;

create or replace function public.set_reader_mute(p_target_id uuid, p_muted boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_target_id is null or p_target_id = v_user then
    raise exception 'INVALID_MUTE_TARGET';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'READER_NOT_FOUND';
  end if;

  if p_muted then
    insert into public.reader_mutes (muter_id, muted_id)
    values (v_user, p_target_id)
    on conflict do nothing;
    return true;
  end if;

  delete from public.reader_mutes
  where muter_id = v_user and muted_id = p_target_id;
  return false;
end;
$$;

create or replace function public.set_reader_block(p_target_id uuid, p_blocked boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_target_id is null or p_target_id = v_user then
    raise exception 'INVALID_BLOCK_TARGET';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'READER_NOT_FOUND';
  end if;

  if p_blocked then
    insert into public.reader_blocks (blocker_id, blocked_id)
    values (v_user, p_target_id)
    on conflict do nothing;
    return true;
  end if;

  delete from public.reader_blocks
  where blocker_id = v_user and blocked_id = p_target_id;
  return false;
end;
$$;

create or replace function public.get_public_reader_profile(p_user_id uuid)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  role public.user_role,
  created_at timestamptz,
  follower_count bigint,
  following_count bigint,
  viewer_follows boolean,
  viewer_muted boolean,
  viewer_blocked boolean,
  profile_public boolean,
  show_shelves boolean,
  show_reviews boolean,
  show_comments boolean,
  allow_follows boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select auth.uid() as id
  ),
  target as (
    select
      p.id, p.username, p.display_name, p.avatar_url, p.bio, p.role, p.created_at,
      coalesce(rp.profile_public, true) as profile_public,
      coalesce(rp.show_shelves, true) as show_shelves,
      coalesce(rp.show_reviews, true) as show_reviews,
      coalesce(rp.show_comments, true) as show_comments,
      coalesce(rp.allow_follows, true) as allow_follows
    from public.profiles p
    left join public.reader_privacy rp on rp.user_id = p.id
    where p.id = p_user_id
  )
  select
    t.id, t.username, t.display_name, t.avatar_url, t.bio, t.role, t.created_at,
    (select count(*) from public.reader_follows rf where rf.following_id = t.id)::bigint as follower_count,
    (select count(*) from public.reader_follows rf where rf.follower_id = t.id)::bigint as following_count,
    coalesce((select exists (
      select 1 from public.reader_follows rf
      where rf.follower_id = v.id and rf.following_id = t.id
    )), false) as viewer_follows,
    coalesce((select exists (
      select 1 from public.reader_mutes rm
      where rm.muter_id = v.id and rm.muted_id = t.id
    )), false) as viewer_muted,
    coalesce((select exists (
      select 1 from public.reader_blocks rb
      where rb.blocker_id = v.id and rb.blocked_id = t.id
    )), false) as viewer_blocked,
    t.profile_public, t.show_shelves, t.show_reviews, t.show_comments, t.allow_follows
  from target t
  cross join viewer v
  where (v.id = t.id or t.profile_public)
    and (v.id is null or v.id = t.id or not private.reader_has_block(t.id, v.id));
$$;

create or replace function public.get_public_reader_shelf(p_user_id uuid, p_limit integer default 50)
returns table (
  book_id uuid,
  title text,
  cover_url text,
  author_name text,
  genre text,
  book_status public.book_status,
  shelf_status public.library_status,
  added_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select auth.uid() as id
  ),
  allowed as (
    select
      p.id,
      coalesce(rp.profile_public, true) as profile_public,
      coalesce(rp.show_shelves, true) as show_shelves
    from public.profiles p
    left join public.reader_privacy rp on rp.user_id = p.id
    where p.id = p_user_id
  )
  select
    l.book_id, b.title, b.cover_url, a.pen_name as author_name,
    coalesce((select bg.genre from public.book_genres bg where bg.book_id = b.id order by bg.genre limit 1), '') as genre,
    b.status as book_status, l.status as shelf_status, l.added_at
  from allowed x
  cross join viewer v
  join public.library l on l.user_id = x.id
  join public.books b on b.id = l.book_id
  join public.authors a on a.id = b.author_id
  where (v.id = x.id or (x.profile_public and x.show_shelves))
    and (v.id = x.id or not private.readers_blocked(v.id, x.id))
    and l.status in ('favorite'::public.library_status, 'completed'::public.library_status)
    and b.visibility = 'public'::public.book_visibility
    and b.status <> 'draft'::public.book_status
    and b.moderation_state = 'approved'::public.moderation_state
    and a.moderation_state = 'approved'::public.moderation_state
  order by l.added_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.get_reader_public_activity(p_user_id uuid, p_limit integer default 30)
returns table (
  activity_type text,
  activity_id uuid,
  actor_user_id uuid,
  book_id uuid,
  book_title text,
  chapter_id uuid,
  rating smallint,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select auth.uid() as id
  ),
  allowed as (
    select
      p.id,
      coalesce(rp.profile_public, true) as profile_public,
      coalesce(rp.show_reviews, true) as show_reviews,
      coalesce(rp.show_comments, true) as show_comments
    from public.profiles p
    left join public.reader_privacy rp on rp.user_id = p.id
    where p.id = p_user_id
  ),
  review_activity as (
    select
      'review'::text as activity_type,
      br.id as activity_id,
      br.user_id as actor_user_id,
      br.book_id,
      b.title as book_title,
      null::uuid as chapter_id,
      br.rating::smallint as rating,
      br.review_text as body,
      br.created_at
    from allowed x
    cross join viewer v
    join public.book_reviews br on br.user_id = x.id
    join public.books b on b.id = br.book_id
    join public.authors a on a.id = b.author_id
    where (v.id = x.id or (x.profile_public and x.show_reviews))
      and (v.id = x.id or not private.readers_blocked(v.id, x.id))
      and br.moderation_state = 'approved'::public.moderation_state
      and b.visibility = 'public'::public.book_visibility
      and b.status <> 'draft'::public.book_status
      and b.moderation_state = 'approved'::public.moderation_state
      and a.moderation_state = 'approved'::public.moderation_state
  ),
  comment_activity as (
    select
      'comment'::text as activity_type,
      c.id as activity_id,
      c.user_id as actor_user_id,
      c.book_id,
      b.title as book_title,
      c.chapter_id,
      null::smallint as rating,
      c.content as body,
      c.created_at
    from allowed x
    cross join viewer v
    join public.comments c on c.user_id = x.id
    join public.books b on b.id = c.book_id
    join public.authors a on a.id = b.author_id
    left join public.chapters ch on ch.id = c.chapter_id
    where (v.id = x.id or (x.profile_public and x.show_comments))
      and (v.id = x.id or not private.readers_blocked(v.id, x.id))
      and c.moderation_state = 'approved'::public.moderation_state
      and b.visibility = 'public'::public.book_visibility
      and b.status <> 'draft'::public.book_status
      and b.moderation_state = 'approved'::public.moderation_state
      and a.moderation_state = 'approved'::public.moderation_state
      and (c.chapter_id is null or (ch.status = 'published'::public.chapter_status and ch.moderation_state = 'approved'::public.moderation_state))
  )
  select *
  from (
    select * from review_activity
    union all
    select * from comment_activity
  ) activity
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

create or replace function public.search_public_readers(p_query text default '', p_limit integer default 20)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  role public.user_role,
  follower_count bigint,
  viewer_follows boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with viewer as (
    select auth.uid() as id
  )
  select
    p.id, p.username, p.display_name, p.avatar_url, p.bio, p.role,
    (select count(*) from public.reader_follows rf where rf.following_id = p.id)::bigint as follower_count,
    coalesce((select exists (
      select 1 from public.reader_follows rf
      where rf.follower_id = v.id and rf.following_id = p.id
    )), false) as viewer_follows
  from public.profiles p
  cross join viewer v
  left join public.reader_privacy rp on rp.user_id = p.id
  where coalesce(rp.profile_public, true)
    and p.id <> coalesce(v.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and (v.id is null or not private.readers_blocked(v.id, p.id))
    and (
      nullif(trim(coalesce(p_query, '')), '') is null
      or coalesce(p.display_name, '') ilike '%' || trim(p_query) || '%'
      or coalesce(p.username, '') ilike '%' || trim(p_query) || '%'
    )
  order by follower_count desc, p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

create or replace function public.get_community_feed(p_limit integer default 40)
returns table (
  activity_type text,
  activity_id uuid,
  actor_user_id uuid,
  actor_name text,
  actor_avatar_url text,
  book_id uuid,
  book_title text,
  chapter_id uuid,
  rating smallint,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  return query
  with actors as (
    select v_user as user_id
    union
    select rf.following_id
    from public.reader_follows rf
    join public.reader_privacy rp on rp.user_id = rf.following_id
    where rf.follower_id = v_user
      and rp.profile_public
      and not private.readers_blocked(v_user, rf.following_id)
      and not exists (
        select 1 from public.reader_mutes rm
        where rm.muter_id = v_user and rm.muted_id = rf.following_id
      )
  ),
  review_activity as (
    select
      'review'::text as activity_type,
      br.id as activity_id,
      br.user_id as actor_user_id,
      coalesce(p.display_name, p.username, 'Độc giả CHƯƠNG') as actor_name,
      p.avatar_url as actor_avatar_url,
      br.book_id,
      b.title as book_title,
      null::uuid as chapter_id,
      br.rating::smallint as rating,
      br.review_text as body,
      br.created_at
    from actors x
    join public.profiles p on p.id = x.user_id
    left join public.reader_privacy rp on rp.user_id = p.id
    join public.book_reviews br on br.user_id = x.user_id
    join public.books b on b.id = br.book_id
    join public.authors a on a.id = b.author_id
    where (x.user_id = v_user or coalesce(rp.show_reviews, true))
      and br.moderation_state = 'approved'::public.moderation_state
      and b.visibility = 'public'::public.book_visibility
      and b.status <> 'draft'::public.book_status
      and b.moderation_state = 'approved'::public.moderation_state
      and a.moderation_state = 'approved'::public.moderation_state
  ),
  comment_activity as (
    select
      'comment'::text as activity_type,
      c.id as activity_id,
      c.user_id as actor_user_id,
      coalesce(p.display_name, p.username, 'Độc giả CHƯƠNG') as actor_name,
      p.avatar_url as actor_avatar_url,
      c.book_id,
      b.title as book_title,
      c.chapter_id,
      null::smallint as rating,
      c.content as body,
      c.created_at
    from actors x
    join public.profiles p on p.id = x.user_id
    left join public.reader_privacy rp on rp.user_id = p.id
    join public.comments c on c.user_id = x.user_id
    join public.books b on b.id = c.book_id
    join public.authors a on a.id = b.author_id
    left join public.chapters ch on ch.id = c.chapter_id
    where (x.user_id = v_user or coalesce(rp.show_comments, true))
      and c.moderation_state = 'approved'::public.moderation_state
      and b.visibility = 'public'::public.book_visibility
      and b.status <> 'draft'::public.book_status
      and b.moderation_state = 'approved'::public.moderation_state
      and a.moderation_state = 'approved'::public.moderation_state
      and (c.chapter_id is null or (ch.status = 'published'::public.chapter_status and ch.moderation_state = 'approved'::public.moderation_state))
  )
  select *
  from (
    select * from review_activity
    union all
    select * from comment_activity
  ) activity
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
end;
$$;

revoke all on function public.get_my_reader_privacy() from public;
revoke all on function public.update_reader_privacy(boolean, boolean, boolean, boolean, boolean) from public;
revoke all on function public.set_reader_follow(uuid, boolean) from public;
revoke all on function public.set_reader_mute(uuid, boolean) from public;
revoke all on function public.set_reader_block(uuid, boolean) from public;
revoke all on function public.get_public_reader_profile(uuid) from public;
revoke all on function public.get_public_reader_shelf(uuid, integer) from public;
revoke all on function public.get_reader_public_activity(uuid, integer) from public;
revoke all on function public.search_public_readers(text, integer) from public;
revoke all on function public.get_community_feed(integer) from public;

grant execute on function public.get_my_reader_privacy() to authenticated;
grant execute on function public.update_reader_privacy(boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.set_reader_follow(uuid, boolean) to authenticated;
grant execute on function public.set_reader_mute(uuid, boolean) to authenticated;
grant execute on function public.set_reader_block(uuid, boolean) to authenticated;
grant execute on function public.get_public_reader_profile(uuid) to anon, authenticated;
grant execute on function public.get_public_reader_shelf(uuid, integer) to anon, authenticated;
grant execute on function public.get_reader_public_activity(uuid, integer) to anon, authenticated;
grant execute on function public.search_public_readers(text, integer) to anon, authenticated;
grant execute on function public.get_community_feed(integer) to authenticated;

commit;
