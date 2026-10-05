-- CHUONG Phase 4R1: notify followers when a chapter becomes public.
-- Works for both scheduled releases and manual publishing.
begin;

alter table public.notification_preferences
  add column if not exists new_chapters boolean not null default true;

alter table public.notifications
  drop constraint if exists notifications_category_check;
alter table public.notifications
  add constraint notifications_category_check
  check (category in ('purchase','author_earnings','payout','comment','moderation','release','system'));

create or replace function private.notification_category_enabled(
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

  if not found then return true; end if;
  if not v_pref.in_app_enabled then return false; end if;

  return case p_category
    when 'purchase' then v_pref.purchases
    when 'author_earnings' then v_pref.author_earnings
    when 'payout' then v_pref.payouts
    when 'comment' then v_pref.comments
    when 'moderation' then v_pref.moderation
    when 'release' then v_pref.new_chapters
    when 'system' then v_pref.system
    else true
  end;
end;
$$;

revoke execute on function private.notification_category_enabled(uuid,text) from public, anon, authenticated;

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
    when 'release' then v_pref.new_chapters
    when 'system' then v_pref.system
    else true
  end;
end;
$$;

revoke execute on function private.push_category_enabled(uuid,text) from public, anon, authenticated;

create or replace function public.update_notification_preferences(
  p_in_app_enabled boolean,
  p_purchases boolean,
  p_author_earnings boolean,
  p_payouts boolean,
  p_comments boolean,
  p_moderation boolean,
  p_new_chapters boolean,
  p_system boolean,
  p_push_enabled boolean
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.notification_preferences%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  insert into public.notification_preferences(
    user_id,
    in_app_enabled,
    purchases,
    author_earnings,
    payouts,
    comments,
    moderation,
    new_chapters,
    system,
    push_enabled
  ) values (
    v_uid,
    coalesce(p_in_app_enabled,true),
    coalesce(p_purchases,true),
    coalesce(p_author_earnings,true),
    coalesce(p_payouts,true),
    coalesce(p_comments,true),
    coalesce(p_moderation,true),
    coalesce(p_new_chapters,true),
    coalesce(p_system,true),
    coalesce(p_push_enabled,false)
  )
  on conflict(user_id) do update
  set in_app_enabled = excluded.in_app_enabled,
      purchases = excluded.purchases,
      author_earnings = excluded.author_earnings,
      payouts = excluded.payouts,
      comments = excluded.comments,
      moderation = excluded.moderation,
      new_chapters = excluded.new_chapters,
      system = excluded.system,
      push_enabled = excluded.push_enabled,
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.update_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public, anon;
grant execute on function public.update_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

create or replace function private.notify_book_followers_on_chapter_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books%rowtype;
begin
  if new.status <> 'published'::public.chapter_status then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published'::public.chapter_status then
    return new;
  end if;

  if new.moderation_state <> 'approved'::public.moderation_state then
    return new;
  end if;

  select * into v_book
  from public.books b
  where b.id = new.book_id;

  if not found
     or v_book.visibility <> 'public'::public.book_visibility
     or v_book.status = 'draft'::public.book_status
     or v_book.moderation_state <> 'approved'::public.moderation_state
  then
    return new;
  end if;

  insert into public.notifications(
    user_id,
    category,
    event_type,
    title,
    body,
    action_route,
    dedupe_key,
    metadata
  )
  select
    f.user_id,
    'release',
    'chapter_published',
    'Truyện theo dõi vừa có chương mới',
    left(v_book.title || ' · Chương ' || new.chapter_number::text
      || case when length(btrim(new.title)) > 0 then ': ' || btrim(new.title) else '' end, 500),
    '/reader/' || new.book_id::text || '?chapter=' || new.chapter_number::text,
    'chapter_release:' || new.id::text || ':' || f.user_id::text,
    jsonb_build_object(
      'book_id', new.book_id,
      'chapter_id', new.id,
      'chapter_number', new.chapter_number,
      'scheduled_release', old.scheduled_publish_at is not null
    )
  from public.book_follows f
  where f.book_id = new.book_id
    and private.notification_category_enabled(f.user_id, 'release')
  on conflict (user_id, dedupe_key) where dedupe_key is not null
  do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_book_followers_chapter_publish on public.chapters;
create trigger notify_book_followers_chapter_publish
after insert or update of status on public.chapters
for each row execute function private.notify_book_followers_on_chapter_publish();

revoke execute on function private.notify_book_followers_on_chapter_publish() from public, anon, authenticated;

commit;