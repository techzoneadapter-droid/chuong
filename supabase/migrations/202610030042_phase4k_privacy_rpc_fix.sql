-- CHUONG Phase 4K: fix PL/pgSQL output-column ambiguity in privacy RPCs
begin;

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
  on conflict on constraint reader_privacy_pkey do nothing;

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
  on conflict on constraint reader_privacy_pkey do update
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

-- CREATE OR REPLACE can re-apply default API-role function privileges.
revoke execute on function public.get_my_reader_privacy() from anon;
revoke execute on function public.update_reader_privacy(boolean, boolean, boolean, boolean, boolean) from anon;
grant execute on function public.get_my_reader_privacy() to authenticated, service_role;
grant execute on function public.update_reader_privacy(boolean, boolean, boolean, boolean, boolean) to authenticated, service_role;

commit;
