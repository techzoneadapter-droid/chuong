-- CHUONG Phase 4R3: one release notification per reader/book/UTC hour.
-- Reuses notifications_user_dedupe_uq and the existing INSERT-only push queue.
begin;

-- Prevent a publication slipping between the historical seed and trigger replacement.
lock table public.chapters in share row exclusive mode;

-- A private idempotency ledger, not another notification or delivery system.
-- Retains event identity even if notifications expire or a chapter is republished.
create table private.chapter_release_publications (
  chapter_id uuid primary key references public.chapters(id) on delete cascade
);
alter table private.chapter_release_publications enable row level security;
revoke all on private.chapter_release_publications from public, anon, authenticated;

-- Existing published chapters must not notify again after a status round trip.
-- Include old R1 events for chapters that have since returned to draft.
insert into private.chapter_release_publications(chapter_id)
select c.id from public.chapters c where c.status = 'published'
union
select c.id from public.chapters c
join public.notifications n
  on c.id::text = n.metadata->>'chapter_id'
where n.category = 'release' and n.event_type = 'chapter_published'
  and n.dedupe_key like 'chapter_release:%';

create or replace function private.notify_book_followers_on_chapter_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books%rowtype;
  v_released_at timestamptz := statement_timestamp();
  v_bucket text := to_char(v_released_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24');
  v_timestamp text := to_char(v_released_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  v_scheduled boolean := false;
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

  -- Claim the publication once, including across hours and unpublish/republish.
  -- This claim and the notification upsert are in the same trigger transaction.
  insert into private.chapter_release_publications(chapter_id)
  values (new.id)
  on conflict (chapter_id) do nothing;
  if not found then return new; end if;

  if tg_op = 'UPDATE' then
    v_scheduled := old.scheduled_publish_at is not null;
  end if;

  insert into public.notifications as notification(
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
    'chapter_release_batch:' || new.book_id::text || ':' || f.user_id::text || ':' || v_bucket,
    jsonb_build_object(
      'book_id', new.book_id,
      'chapter_id', new.id,
      'chapter_number', new.chapter_number,
      'latest_chapter_id', new.id,
      'latest_chapter_number', new.chapter_number,
      'batch_count', 1,
      'batch_started_at', v_timestamp,
      'batch_updated_at', v_timestamp,
      'scheduled_release', v_scheduled
    )
  from public.book_follows f
  where f.book_id = new.book_id
    and private.notification_category_enabled(f.user_id, 'release')
  -- Stable reader ordering avoids deadlocks between overlapping follower sets.
  order by f.user_id
  on conflict (user_id, dedupe_key) where dedupe_key is not null
  do update set
    title = 'Truyện theo dõi vừa có ' || ((notification.metadata->>'batch_count')::integer + 1)::text || ' chương mới',
    body = left(v_book.title, 440) || ' vừa có ' || ((notification.metadata->>'batch_count')::integer + 1)::text || ' chương mới',
    action_route = '/updates',
    metadata = notification.metadata || excluded.metadata || jsonb_build_object(
      'batch_count', (notification.metadata->>'batch_count')::integer + 1,
      'batch_started_at', notification.metadata->>'batch_started_at',
      'scheduled_release', (notification.metadata->>'scheduled_release')::boolean or v_scheduled
    );
  -- Keep read_at and created_at intact. Only the initial INSERT queues push;
  -- the unique index serializes concurrent increments without lost updates.

  return new;
exception when others then
  return new;
end;
$$;

revoke execute on function private.notify_book_followers_on_chapter_publish() from public, anon, authenticated;

commit;
