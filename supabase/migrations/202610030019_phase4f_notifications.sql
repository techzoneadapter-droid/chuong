-- CHUONG Phase 4F-A: in-app notifications, preferences, unread counts and event triggers
begin;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  in_app_enabled boolean not null default true,
  purchases boolean not null default true,
  author_earnings boolean not null default true,
  payouts boolean not null default true,
  comments boolean not null default true,
  moderation boolean not null default true,
  system boolean not null default true,
  push_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

drop policy if exists "users read own notification preferences" on public.notification_preferences;
create policy "users read own notification preferences" on public.notification_preferences
for select to authenticated
using (user_id = (select auth.uid()));

grant select on public.notification_preferences to authenticated;
revoke insert, update, delete on public.notification_preferences from authenticated;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null
    check (category in ('purchase','author_earnings','payout','comment','moderation','system')),
  event_type text not null,
  title text not null,
  body text not null,
  action_route text,
  dedupe_key text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint notifications_event_nonblank check (length(btrim(event_type)) > 0),
  constraint notifications_title_len check (char_length(title) between 1 and 140),
  constraint notifications_body_len check (char_length(body) between 1 and 500),
  constraint notifications_route_len check (action_route is null or char_length(action_route) <= 500),
  constraint notifications_dedupe_len check (dedupe_key is null or char_length(dedupe_key) <= 300)
);

create unique index if not exists notifications_user_dedupe_uq
  on public.notifications(user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_user_category_idx
  on public.notifications(user_id, category, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications
for select to authenticated
using (user_id = (select auth.uid()));

grant select on public.notifications to authenticated;
revoke insert, update, delete on public.notifications from authenticated;

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
    when 'system' then v_pref.system
    else true
  end;
end;
$$;

create or replace function private.enqueue_notification(
  p_user_id uuid,
  p_category text,
  p_event_type text,
  p_title text,
  p_body text,
  p_action_route text,
  p_dedupe_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then return null; end if;
  if not private.notification_category_enabled(p_user_id, p_category) then return null; end if;

  insert into public.notifications(
    user_id, category, event_type, title, body, action_route, dedupe_key, metadata
  ) values (
    p_user_id,
    p_category,
    p_event_type,
    left(coalesce(p_title,''), 140),
    left(coalesce(p_body,''), 500),
    nullif(p_action_route,''),
    nullif(p_dedupe_key,''),
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function private.notification_category_enabled(uuid,text) from public, anon, authenticated;
revoke execute on function private.enqueue_notification(uuid,text,text,text,text,text,text,jsonb) from public, anon, authenticated;

create or replace function public.get_unread_notification_count()
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)
  from public.notifications n
  where n.user_id = (select auth.uid())
    and n.read_at is null
    and (n.expires_at is null or n.expires_at > now());
$$;

revoke execute on function public.get_unread_notification_count() from public, anon;
grant execute on function public.get_unread_notification_count() to authenticated;

create or replace function public.mark_notification_read(
  p_notification_id uuid
)
returns public.notifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notifications%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.user_id = (select auth.uid())
  returning * into v_row;

  if not found then raise exception 'NOTIFICATION_NOT_FOUND'; end if;
  return v_row;
end;
$$;

revoke execute on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  update public.notifications n
  set read_at = now()
  where n.user_id = (select auth.uid())
    and n.read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.update_notification_preferences(
  p_in_app_enabled boolean,
  p_purchases boolean,
  p_author_earnings boolean,
  p_payouts boolean,
  p_comments boolean,
  p_moderation boolean,
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
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  insert into public.notification_preferences(
    user_id, in_app_enabled, purchases, author_earnings,
    payouts, comments, moderation, system, push_enabled
  ) values (
    v_uid, p_in_app_enabled, p_purchases, p_author_earnings,
    p_payouts, p_comments, p_moderation, p_system, p_push_enabled
  )
  on conflict (user_id) do update
  set in_app_enabled = excluded.in_app_enabled,
      purchases = excluded.purchases,
      author_earnings = excluded.author_earnings,
      payouts = excluded.payouts,
      comments = excluded.comments,
      moderation = excluded.moderation,
      system = excluded.system,
      push_enabled = excluded.push_enabled,
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.update_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean)
  from public, anon;
grant execute on function public.update_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean)
  to authenticated;

create or replace function private.notify_author_revenue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_book_title text;
  v_amount bigint;
  v_title text;
  v_body text;
begin
  select a.user_id into v_user_id
  from public.authors a
  where a.id = new.author_id;

  select b.title into v_book_title
  from public.books b
  where b.id = new.book_id;

  v_amount := greatest(0, new.author_earnings_coins);

  if new.type::text = 'sale' and v_amount > 0 then
    v_title := 'Bạn vừa có doanh thu mới';
    v_body := '+' || v_amount::text || ' Linh Thạch từ ' || coalesce(v_book_title, 'truyện của bạn') || '.';
  elsif new.type::text = 'refund' and v_amount > 0 then
    v_title := 'Doanh thu vừa được điều chỉnh';
    v_body := '-' || v_amount::text || ' Linh Thạch do giao dịch được hoàn/thu hồi.';
  else
    return new;
  end if;

  perform private.enqueue_notification(
    v_user_id,
    'author_earnings',
    'author_revenue_' || new.type::text,
    v_title,
    v_body,
    '/author/revenue',
    'author_revenue:' || new.id::text,
    jsonb_build_object(
      'ledger_id', new.id,
      'book_id', new.book_id,
      'chapter_id', new.chapter_id,
      'amount_coins', v_amount,
      'revenue_type', new.type::text
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_author_revenue_insert on public.author_revenue_ledger;
create trigger notify_author_revenue_insert
after insert on public.author_revenue_ledger
for each row execute function private.notify_author_revenue();

create or replace function private.notify_author_payout_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_title text;
  v_body text;
begin
  if tg_op <> 'UPDATE' or new.status = old.status then return new; end if;

  select a.user_id into v_user_id
  from public.authors a
  where a.id = new.author_id;

  if new.status::text = 'approved' then
    v_title := 'Yêu cầu rút đã được duyệt';
    v_body := new.amount_coins::text || ' Linh Thạch đang chờ đối soát thanh toán.';
  elsif new.status::text = 'paid' then
    v_title := 'Doanh thu đã được thanh toán';
    v_body := new.amount_coins::text || ' Linh Thạch đã được ghi nhận thanh toán'
      || case when new.external_reference is not null then ' · Mã ' || new.external_reference else '' end || '.';
  elsif new.status::text = 'cancelled' then
    v_title := 'Yêu cầu rút đã bị hủy';
    v_body := new.amount_coins::text || ' Linh Thạch đã được giải phóng khỏi yêu cầu rút.';
  else
    return new;
  end if;

  perform private.enqueue_notification(
    v_user_id,
    'payout',
    'payout_' || new.status::text,
    v_title,
    v_body,
    '/author/payout',
    'payout:' || new.id::text || ':' || new.status::text,
    jsonb_build_object(
      'payout_id', new.id,
      'amount_coins', new.amount_coins,
      'status', new.status::text,
      'external_reference', new.external_reference
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_author_payout_status_update on public.author_payouts;
create trigger notify_author_payout_status_update
after update of status on public.author_payouts
for each row execute function private.notify_author_payout_status();

create or replace function private.notify_store_purchase_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.store_purchases%rowtype;
  v_title text;
  v_body text;
begin
  select * into v_purchase
  from public.store_purchases p
  where p.id = new.purchase_id;

  if not found then return new; end if;

  if new.event_type = 'credited' then
    v_title := 'Nạp Linh Thạch thành công';
    v_body := '+' || v_purchase.coins_granted::text || ' Linh Thạch đã được xác minh và ghi nhận.';
  elsif new.event_type = 'revoked' then
    v_title := 'Giao dịch Linh Thạch đã bị thu hồi';
    v_body := v_purchase.coins_granted::text || ' Linh Thạch liên quan giao dịch hoàn/hủy đã được đối soát lại.';
  elsif new.event_type = 'refund_reversed' then
    v_title := 'Linh Thạch đã được khôi phục';
    v_body := v_purchase.coins_granted::text || ' Linh Thạch đã được khôi phục sau khi cửa hàng đảo quyết định hoàn tiền.';
  else
    return new;
  end if;

  perform private.enqueue_notification(
    v_purchase.user_id,
    'purchase',
    'store_' || new.event_type,
    v_title,
    v_body,
    '/wallet',
    'store_event:' || new.id::text,
    jsonb_build_object(
      'purchase_id', new.purchase_id,
      'event_id', new.id,
      'event_type', new.event_type,
      'coins_granted', v_purchase.coins_granted
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_store_purchase_event_insert on public.store_purchase_events;
create trigger notify_store_purchase_event_insert
after insert on public.store_purchase_events
for each row execute function private.notify_store_purchase_event();

create or replace function private.notify_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_user uuid;
  v_book_title text;
  v_author_user uuid;
  v_parent_user uuid;
  v_route text;
begin
  select b.title, a.user_id
  into v_book_title, v_author_user
  from public.books b
  join public.authors a on a.id = b.author_id
  where b.id = new.book_id;

  v_route := '/book/' || new.book_id::text;

  if new.parent_id is not null then
    select c.user_id into v_parent_user
    from public.comments c
    where c.id = new.parent_id;

    if v_parent_user is not null and v_parent_user <> new.user_id then
      perform private.enqueue_notification(
        v_parent_user,
        'comment',
        'comment_reply',
        'Có người trả lời bình luận của bạn',
        left(new.content, 180),
        v_route,
        'comment_reply:' || new.id::text || ':' || v_parent_user::text,
        jsonb_build_object(
          'comment_id', new.id,
          'parent_id', new.parent_id,
          'book_id', new.book_id,
          'chapter_id', new.chapter_id
        )
      );
    end if;
  elsif v_author_user is not null and v_author_user <> new.user_id then
    perform private.enqueue_notification(
      v_author_user,
      'comment',
      'book_comment',
      'Truyện của bạn có bình luận mới',
      coalesce(v_book_title, 'Truyện của bạn') || ': ' || left(new.content, 160),
      v_route,
      'book_comment:' || new.id::text || ':' || v_author_user::text,
      jsonb_build_object(
        'comment_id', new.id,
        'book_id', new.book_id,
        'chapter_id', new.chapter_id
      )
    );
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_comment_insert on public.comments;
create trigger notify_comment_insert
after insert on public.comments
for each row execute function private.notify_comment_insert();

create or replace function private.notify_book_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_title text;
  v_body text;
begin
  if new.moderation_state = old.moderation_state then return new; end if;

  select a.user_id into v_user_id
  from public.authors a
  where a.id = new.author_id;

  v_title := case new.moderation_state::text
    when 'hidden' then 'Truyện đã bị ẩn'
    when 'rejected' then 'Truyện không đạt kiểm duyệt'
    else 'Truyện đã được khôi phục'
  end;
  v_body := new.title
    || case when new.moderation_note is not null then ' · ' || left(new.moderation_note, 260) else '' end;

  perform private.enqueue_notification(
    v_user_id,
    'moderation',
    'book_moderation_' || new.moderation_state::text,
    v_title,
    v_body,
    '/author',
    'book_moderation:' || new.id::text || ':' || new.moderation_state::text || ':' || coalesce(new.moderated_at::text, now()::text),
    jsonb_build_object('book_id', new.id, 'moderation_state', new.moderation_state::text)
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_book_moderation_update on public.books;
create trigger notify_book_moderation_update
after update of moderation_state on public.books
for each row execute function private.notify_book_moderation();

create or replace function private.notify_chapter_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_book_title text;
  v_title text;
begin
  if new.moderation_state = old.moderation_state then return new; end if;

  select a.user_id, b.title
  into v_user_id, v_book_title
  from public.books b
  join public.authors a on a.id = b.author_id
  where b.id = new.book_id;

  v_title := case new.moderation_state::text
    when 'hidden' then 'Chương đã bị ẩn'
    when 'rejected' then 'Chương không đạt kiểm duyệt'
    else 'Chương đã được khôi phục'
  end;

  perform private.enqueue_notification(
    v_user_id,
    'moderation',
    'chapter_moderation_' || new.moderation_state::text,
    v_title,
    coalesce(v_book_title, 'Truyện') || ' · Chương ' || new.chapter_number::text
      || case when new.moderation_note is not null then ' · ' || left(new.moderation_note, 220) else '' end,
    '/author',
    'chapter_moderation:' || new.id::text || ':' || new.moderation_state::text || ':' || coalesce(new.moderated_at::text, now()::text),
    jsonb_build_object('book_id', new.book_id, 'chapter_id', new.id, 'moderation_state', new.moderation_state::text)
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_chapter_moderation_update on public.chapters;
create trigger notify_chapter_moderation_update
after update of moderation_state on public.chapters
for each row execute function private.notify_chapter_moderation();

create or replace function private.notify_comment_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if new.moderation_state = old.moderation_state then return new; end if;

  v_title := case new.moderation_state::text
    when 'hidden' then 'Bình luận của bạn đã bị ẩn'
    when 'rejected' then 'Bình luận của bạn không đạt kiểm duyệt'
    else 'Bình luận của bạn đã được khôi phục'
  end;

  perform private.enqueue_notification(
    new.user_id,
    'moderation',
    'comment_moderation_' || new.moderation_state::text,
    v_title,
    case when new.moderation_note is not null then left(new.moderation_note, 300) else 'Xem lại bình luận và nội dung liên quan.' end,
    '/book/' || new.book_id::text,
    'comment_moderation:' || new.id::text || ':' || new.moderation_state::text || ':' || coalesce(new.moderated_at::text, now()::text),
    jsonb_build_object('comment_id', new.id, 'book_id', new.book_id, 'chapter_id', new.chapter_id)
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_comment_moderation_update on public.comments;
create trigger notify_comment_moderation_update
after update of moderation_state on public.comments
for each row execute function private.notify_comment_moderation();

create or replace function private.notify_report_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin record;
  v_title text;
begin
  if tg_op = 'INSERT' then
    for v_admin in
      select p.id
      from public.profiles p
      where p.role::text = 'admin'
    loop
      if v_admin.id <> new.reporter_id then
        perform private.enqueue_notification(
          v_admin.id,
          'moderation',
          'report_created',
          'Có báo cáo mới cần xem xét',
          'Một báo cáo mới vừa được gửi vào hàng đợi kiểm duyệt.',
          '/admin/reports',
          'report_created:' || new.id::text || ':' || v_admin.id::text,
          jsonb_build_object('report_id', new.id, 'reason', new.reason::text)
        );
      end if;
    end loop;
  elsif tg_op = 'UPDATE' and new.status <> old.status
    and new.reporter_id is not null
    and new.status::text in ('resolved','rejected') then

    v_title := case new.status::text
      when 'resolved' then 'Báo cáo của bạn đã được xử lý'
      else 'Báo cáo của bạn đã được đóng'
    end;

    perform private.enqueue_notification(
      new.reporter_id,
      'moderation',
      'report_' || new.status::text,
      v_title,
      coalesce(nullif(new.resolution_note,''), 'Cảm ơn bạn đã gửi báo cáo cho CHƯƠNG.'),
      '/profile',
      'report_status:' || new.id::text || ':' || new.status::text,
      jsonb_build_object('report_id', new.id, 'status', new.status::text)
    );
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_report_insert on public.reports;
create trigger notify_report_insert
after insert on public.reports
for each row execute function private.notify_report_events();

drop trigger if exists notify_report_status_update on public.reports;
create trigger notify_report_status_update
after update of status on public.reports
for each row execute function private.notify_report_events();

commit;
