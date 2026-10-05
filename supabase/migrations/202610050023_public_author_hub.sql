-- Phase 4R4: public publishing identity and author release batches.
begin;
lock table public.books, public.authors in share row exclusive mode;
alter table public.notification_preferences add column new_books boolean not null default true;
drop function public.update_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean);
create or replace function public.update_notification_preferences(
  p_in_app_enabled boolean,
  p_purchases boolean,
  p_author_earnings boolean,
  p_payouts boolean,
  p_comments boolean,
  p_moderation boolean,
  p_new_chapters boolean,
  p_system boolean,
  p_push_enabled boolean,
  p_new_books boolean default null
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
    push_enabled,
    new_books
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
    coalesce(p_push_enabled,false),
    coalesce(p_new_books,true)
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
      new_books = coalesce(p_new_books, public.notification_preferences.new_books),
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.update_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public, anon;
grant execute on function public.update_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

create or replace function private.queue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category = 'release' and new.event_type = 'book_published' then
    if not coalesce((select p.push_enabled and p.new_books and p.in_app_enabled
      from public.notification_preferences p where p.user_id = new.user_id), false) then
      return new;
    end if;
  elsif not private.push_category_enabled(new.user_id, new.category) then
    return new;
  end if;

  insert into public.push_deliveries(notification_id, device_id)
  select new.id, d.id
  from public.push_devices d
  where d.user_id = new.user_id
    and d.enabled = true
    and d.invalidated_at is null
  on conflict (notification_id, device_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;


revoke execute on function private.queue_notification_push() from public, anon, authenticated;

create table private.author_book_publications (
  book_id uuid primary key references public.books(id) on delete cascade,
  released_at timestamptz not null
);
alter table private.author_book_publications enable row level security;
revoke all on private.author_book_publications from public, anon, authenticated;
-- No pre-R4 book release history exists. Conservatively mark all non-drafts,
-- including currently private/hidden books, plus drafts with published evidence.
-- This avoids replaying releases that were hidden before migration.
insert into private.author_book_publications(book_id,released_at)
select b.id,b.created_at from public.books b
where b.status <> 'draft' or exists (
  select 1 from public.chapters c where c.book_id=b.id and c.status='published'
);

create function private.publish_author_book(p_book_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_book public.books%rowtype;
  v_author public.authors%rowtype;
  v_at timestamptz := statement_timestamp();
  v_bucket text := to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24');
begin
  select * into v_book from public.books where id=p_book_id;
  if not found or v_book.visibility <> 'public' or v_book.status='draft'
    or v_book.moderation_state <> 'approved' then return; end if;
  select * into v_author from public.authors where id=v_book.author_id;
  if not found or v_author.moderation_state <> 'approved' then return; end if;
  insert into private.author_book_publications values(v_book.id,v_at)
  on conflict(book_id) do nothing;
  if not found then return; end if;

  insert into public.notifications as notification
    (user_id,category,event_type,title,body,action_route,dedupe_key,metadata)
  select f.user_id,'release','book_published',
    'Tác giả bạn theo dõi vừa ra truyện mới',
    left(v_author.pen_name || ' · ' || v_book.title,500),
    '/book/' || v_book.id::text,
    'author_release_batch:' || v_author.id::text || ':' || f.user_id::text || ':' || v_bucket,
    jsonb_build_object('author_id',v_author.id,'book_id',v_book.id,'book_title',v_book.title,
      'latest_book_id',v_book.id,'latest_book_title',v_book.title,'batch_count',1,
      'batch_started_at',v_at,'batch_updated_at',v_at)
  from public.author_follows f
  where f.author_id=v_author.id and f.user_id <> v_author.user_id
    and not private.readers_blocked(f.user_id,v_author.user_id)
    and coalesce((select p.in_app_enabled and p.new_books from public.notification_preferences p
      where p.user_id=f.user_id),true)
  order by f.user_id
  on conflict(user_id,dedupe_key) where dedupe_key is not null do update set
    body= v_author.pen_name || ' vừa phát hành ' || ((notification.metadata->>'batch_count')::integer+1)::text || ' truyện mới',
    action_route='/creator/' || v_author.id::text,
    metadata=notification.metadata || excluded.metadata || jsonb_build_object(
      'batch_count',(notification.metadata->>'batch_count')::integer+1,
      'batch_started_at',notification.metadata->'batch_started_at');
  -- Fail atomically: never swallow an error after claiming the release ledger.
end;
$$;
revoke all on function private.publish_author_book(uuid) from public,anon,authenticated;

create function private.notify_author_book_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='books' then
    perform private.publish_author_book(new.id);
  elsif new.moderation_state='approved' and old.moderation_state <> 'approved' then
    perform private.publish_author_book(b.id) from public.books b where b.author_id=new.id order by b.id;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_author_book_publish() from public,anon,authenticated;
create trigger author_book_release after insert or update of visibility,status,moderation_state on public.books
for each row execute function private.notify_author_book_publish();
create trigger author_approval_book_release after update of moderation_state on public.authors
for each row execute function private.notify_author_book_publish();

create function public.get_public_author_hub(p_author_id uuid)
returns table(author_id uuid,pen_name text,bio text,avatar_url text,verified boolean,
  followers_count bigint,public_books_count bigint,viewer_follows boolean,viewer_is_author boolean,
  viewer_can_follow boolean,gift_book_id uuid,gift_book_title text)
language sql stable security definer set search_path = '' as $$
  select a.id,a.pen_name,a.bio,a.avatar_url,a.verified,a.followers_count,
    (select count(*) from public.books b where b.author_id=a.id and b.visibility='public'
      and b.status <> 'draft' and b.moderation_state='approved'),
    exists(select 1 from public.author_follows f where f.author_id=a.id and f.user_id=auth.uid()),
    coalesce(a.user_id=auth.uid(),false),
    auth.uid() is not null and a.user_id <> auth.uid() and not private.readers_blocked(auth.uid(),a.user_id),
    g.id,g.title
  from public.authors a
  left join lateral (select b.id,b.title from public.books b
    left join private.author_book_publications p on p.book_id=b.id
    where b.author_id=a.id and b.visibility='public' and b.status <> 'draft' and b.moderation_state='approved'
    order by p.released_at desc nulls last,b.updated_at desc,b.id limit 1) g on true
  where a.id=p_author_id and a.moderation_state='approved'
    and not private.readers_blocked(auth.uid(),a.user_id);
$$;

create function public.get_public_author_books(p_author_id uuid,p_limit integer default 20,p_offset integer default 0)
returns table(id uuid,title text,cover_url text,status public.book_status,is_vip boolean,
  rating numeric,total_chapters integer,genre text,credited_author_name text)
language sql stable security definer set search_path = '' as $$
  select b.id,b.title,b.cover_url,b.status,b.is_vip,b.rating,b.total_chapters,
    (select bg.genre from public.book_genres bg where bg.book_id=b.id order by bg.genre limit 1),b.credited_author_name
  from public.books b join public.authors a on a.id=b.author_id
  left join private.author_book_publications p on p.book_id=b.id
  where a.id=p_author_id and a.moderation_state='approved'
    and b.visibility='public' and b.status <> 'draft' and b.moderation_state='approved'
    and not private.readers_blocked(auth.uid(),a.user_id)
  order by p.released_at desc nulls last,b.updated_at desc,b.id
  limit greatest(1,least(coalesce(p_limit,20),20)) offset greatest(0,coalesce(p_offset,0));
$$;
revoke all on function public.get_public_author_hub(uuid),public.get_public_author_books(uuid,integer,integer) from public;
grant execute on function public.get_public_author_hub(uuid),public.get_public_author_books(uuid,integer,integer) to anon,authenticated;

-- Same table/state/counter trigger as Book Detail; enforce blocked interactions
-- for both callers without changing reader social privacy or reader_follows.
create function private.author_can_follow(p_author_id uuid,p_viewer_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_viewer_id is not null and exists(select 1 from public.authors a where a.id=p_author_id
    and a.moderation_state='approved' and a.user_id <> p_viewer_id
    and not private.readers_blocked(p_viewer_id,a.user_id));
$$;
revoke all on function private.author_can_follow(uuid,uuid) from public,anon;
grant execute on function private.author_can_follow(uuid,uuid) to authenticated;
alter policy "users manage own author follows" on public.author_follows to authenticated
with check ((select auth.uid())=user_id and private.author_can_follow(author_id,(select auth.uid())));
commit;
