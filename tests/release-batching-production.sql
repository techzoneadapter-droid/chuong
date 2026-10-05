-- Phase 4R3 production-safe smoke test. All fixtures and queued pushes roll back.
-- No real book, purchase, balance, settlement, or payout row is changed.
begin;
do $test$
declare
  v_reader uuid := gen_random_uuid();
  v_writer uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_book uuid := gen_random_uuid();
  v_scheduled_book uuid := gen_random_uuid();
  v_notification uuid;
  v_chapter uuid;
  v_row public.notifications%rowtype;
  v_count bigint;
  v_scheduler text;
  v_body text;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into auth.users(id,raw_user_meta_data) values
    (v_reader,'{"display_name":"Phase 4R3 temporary reader"}'),
    (v_writer,'{"display_name":"Phase 4R3 temporary writer"}');
  insert into public.authors(id,user_id,pen_name) values(v_author,v_writer,'Tác giả kiểm thử R3');
  insert into public.books(id,author_id,title,slug,status,visibility) values
    (v_book,v_author,'Truyện kiểm thử R3','phase4r3-'||v_book::text,'ongoing','public'),
    (v_scheduled_book,v_author,'Truyện lịch kiểm thử R3','phase4r3-'||v_scheduled_book::text,'ongoing','public');
  insert into public.book_follows(user_id,book_id) values(v_reader,v_book),(v_reader,v_scheduled_book);
  insert into public.notification_preferences(user_id,push_enabled) values(v_reader,true);
  insert into public.push_devices(user_id,device_key,expo_push_token,platform,enabled) values
    (v_reader,'phase4r3-enabled-'||v_reader::text,'ExponentPushToken[phase4r3-'||v_reader::text||']','android',true),
    (v_reader,'phase4r3-disabled-'||v_reader::text,'ExponentPushToken[phase4r3-disabled-'||v_reader::text||']','ios',false);
  insert into public.chapters(book_id,chapter_number,title,content,is_vip,price_coins)
    select v_book,n,'Chương kiểm thử '||n,repeat('Nội dung VIP bí mật ',20),n=101,case when n=101 then 10 else 0 end
    from unnest(array[101,103,108,120,150,200]) n;

  update public.chapters set status='published' where book_id=v_book and chapter_number=101 returning id into v_chapter;
  select * into strict v_row from public.notifications where user_id=v_reader and category='release';
  v_notification := v_row.id;
  if v_row.metadata->>'batch_count' <> '1' or v_row.action_route <> '/reader/'||v_book::text||'?chapter=101'
    or v_row.metadata->>'latest_chapter_id' <> v_chapter::text then raise exception 'R3 single release failed'; end if;
  select count(*) into v_count from public.push_deliveries where notification_id=v_notification;
  if v_count <> 1 then raise exception 'R3 single push failed: %',v_count; end if;

  update public.chapters set status='published' where book_id=v_book and chapter_number in (103,108,120,150);
  select * into strict v_row from public.notifications where user_id=v_reader and category='release';
  if v_row.id <> v_notification or v_row.metadata->>'batch_count' <> '5' or v_row.action_route <> '/updates'
    then raise exception 'R3 multi-chapter batching failed'; end if;
  select count(*) into v_count from public.push_deliveries where notification_id=v_notification;
  if v_count <> 1 then raise exception 'R3 push anti-spam failed'; end if;
  update public.chapters set title='Tiêu đề đã sửa',status='published' where id=v_chapter;
  update public.chapters set status='draft' where id=v_chapter;
  update public.chapters set status='published' where id=v_chapter;
  if (select metadata->>'batch_count' from public.notifications where id=v_notification) <> '5'
    then raise exception 'R3 publication replay failed'; end if;

  insert into public.chapters(book_id,chapter_number,title,content,scheduled_publish_at)
    select v_scheduled_book,n,'Lịch kiểm thử '||n,repeat('Nội dung ',20),now()-interval '1 minute' from generate_series(1,5) n;
  -- Execute the inspected production scheduler body with BOTH book scans scoped
  -- to our uncommitted fixture. Calling the global scheduler could affect real
  -- due chapters. No production function or cron job is replaced.
  v_scheduler := pg_get_functiondef('private.publish_due_chapters()'::regprocedure);
  v_body := split_part(v_scheduler,'$function$',2);
  if strpos(v_body,'where c.status =') = 0 or strpos(v_body,'where b.schedule_final_status is not null') = 0
    or strpos(v_body,'return v_published;') = 0 then raise exception 'Unexpected scheduler definition; refusing global execution'; end if;
  v_body := replace(v_body,'where c.status =',format('where c.book_id = %L::uuid and c.status =',v_scheduled_book));
  v_body := replace(v_body,'where b.schedule_final_status is not null',format('where b.id = %L::uuid and b.schedule_final_status is not null',v_scheduled_book));
  execute 'do $scheduler$'||replace(v_body,'return v_published;', 'if v_published <> 5 then raise exception ''R3 scheduled count failed''; end if;')||'$scheduler$';
  execute 'do $scheduler$'||replace(v_body,'return v_published;', 'if v_published <> 0 then raise exception ''R3 scheduler retry failed''; end if;')||'$scheduler$';
  select * into strict v_row from public.notifications where user_id=v_reader and metadata->>'book_id'=v_scheduled_book::text;
  if v_row.metadata->>'batch_count' <> '5' or v_row.metadata->>'scheduled_release' <> 'true' or v_row.action_route <> '/updates'
    then raise exception 'R3 scheduled batch failed'; end if;
  select count(*) into v_count from public.notifications where user_id=v_reader and category='release';
  if v_count <> 2 then raise exception 'R3 distinct books failed'; end if;
  select count(*) into v_count from public.push_deliveries d join public.notifications n on n.id=d.notification_id where n.user_id=v_reader;
  if v_count <> 2 then raise exception 'R3 scheduled push anti-spam failed'; end if;

  update public.notification_preferences set new_chapters=false where user_id=v_reader;
  update public.chapters set status='published' where book_id=v_book and chapter_number=200;
  if (select metadata->>'batch_count' from public.notifications where id=v_notification) <> '5'
    then raise exception 'R3 opt-out failed'; end if;
  perform set_config('request.jwt.claim.sub',v_reader::text,true);
  select unread_count into v_count from public.get_my_followed_book_updates() where book_id=v_book;
  if v_count <> 6 then raise exception 'R3 Update Center count failed: %',v_count; end if;
  select unread_chapters into v_count from public.get_my_followed_book_update_badge();
  if v_count <> 11 then raise exception 'R3 Update Center badge failed'; end if;
  if (select content from public.get_chapter_for_reading(v_book,101)) is not null then raise exception 'R3 VIP paywall failed'; end if;
  if exists(select 1 from public.notifications where user_id=v_reader and (metadata ? 'content' or metadata ? 'chapter_content'))
    then raise exception 'R3 metadata content leak'; end if;
  if has_function_privilege('anon','private.notify_book_followers_on_chapter_publish()','execute')
    or has_function_privilege('authenticated','private.notify_book_followers_on_chapter_publish()','execute')
    or has_table_privilege('authenticated','private.chapter_release_publications','select')
    or has_function_privilege('anon','public.get_my_followed_book_updates(integer,integer,boolean)','execute')
    or has_function_privilege('anon','public.get_my_followed_book_update_badge()','execute')
    then raise exception 'R3 helper/RPC permissions failed'; end if;
end;
$test$;
select 'PASS: single release, batching, scoped scheduled publisher/retry, per-device push counts, opt-out, replay, sparse updates, VIP and permissions; fixtures rolled back' as result;
rollback;
