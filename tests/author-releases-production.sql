-- Rollback-only R4 verification. No fixture, outbox delivery, or economic row commits.
begin;
do $test$
declare
  v_reader uuid := gen_random_uuid();
  v_writer uuid := gen_random_uuid();
  v_writer2 uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_author2 uuid := gen_random_uuid();
  v_book uuid := gen_random_uuid();
  v_new uuid;
  v_row public.notifications%rowtype;
  v_n bigint;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into auth.users(id,raw_user_meta_data) values
    (v_reader,'{"display_name":"R4 rollback reader"}'),
    (v_writer,'{"display_name":"R4 rollback writer"}'),
    (v_writer2,'{"display_name":"R4 rollback writer 2"}');
  insert into public.authors(id,user_id,pen_name) values
    (v_author,v_writer,'Tác giả thử R4'),(v_author2,v_writer2,'Tác giả thử R4 thứ hai');
  perform set_config('request.jwt.claim.sub',v_reader::text,true);
  insert into public.notification_preferences(user_id,new_chapters,push_enabled) values(v_reader,false,true);
  insert into public.push_devices(user_id,device_key,expo_push_token,platform,enabled) values
    (v_reader,'r4-device-1-'||v_reader,'ExponentPushToken[r4-fixture-'||v_reader||']','android',true),
    (v_reader,'r4-device-2-'||v_reader,'ExponentPushToken[r4-fixture2-'||v_reader||']','ios',true),
    (v_reader,'r4-disabled-'||v_reader,'ExponentPushToken[r4-disabled-'||v_reader||']','ios',false);
  insert into public.notification_preferences(user_id,push_enabled) values(v_writer2,false);
  insert into public.push_devices(user_id,device_key,expo_push_token,platform,enabled)
  values(v_writer2,'r4-no-push-'||v_writer2,'ExponentPushToken[r4-no-push-'||v_writer2||']','ios',true);
  insert into public.author_follows(user_id,author_id) values(v_reader,v_author),(v_reader,v_author2),(v_writer2,v_author);
  if not (select viewer_follows from public.get_public_author_hub(v_author)) then raise exception 'R4 follow sync failed'; end if;
  delete from public.author_follows where user_id=v_reader and author_id=v_author;
  if (select viewer_follows from public.get_public_author_hub(v_author)) then raise exception 'R4 unfollow sync failed'; end if;
  insert into public.author_follows(user_id,author_id) values(v_reader,v_author);
  if (select followers_count from public.authors where id=v_author) <> 2 then raise exception 'R4 counter mismatch'; end if;

  insert into public.books(id,author_id,title,slug,status,visibility)
  values(v_book,v_author,'Truyện thử R4','r4-rollback-'||v_book,'ongoing','public');
  if not exists(select 1 from public.notifications where user_id=v_writer2 and event_type='book_published')
    or exists(select 1 from public.push_deliveries d join public.notifications n on n.id=d.notification_id where n.user_id=v_writer2) then
    raise exception 'R4 push_enabled=false behavior failed';
  end if;
  select * into strict v_row from public.notifications where user_id=v_reader and event_type='book_published';
  if v_row.action_route <> '/book/'||v_book or v_row.metadata->>'batch_count' <> '1' then raise exception 'R4 single release failed'; end if;
  select count(*) into v_n from public.push_deliveries where notification_id=v_row.id;
  if v_n <> 2 then raise exception 'R4 enabled device push count failed: %',v_n; end if;
  update public.books set title='Tên sửa R4',description='Mô tả sửa' where id=v_book;
  update public.books set moderation_state='hidden' where id=v_book;
  update public.books set moderation_state='approved' where id=v_book;
  update public.books set visibility='private' where id=v_book;
  update public.books set visibility='public' where id=v_book;
  for i in 2..5 loop
    v_new := gen_random_uuid();
    insert into public.books(id,author_id,title,slug,status,visibility)
    values(v_new,v_author,'Truyện thử R4 '||i,'r4-rollback-'||v_new,'ongoing','public');
  end loop;
  select * into strict v_row from public.notifications where user_id=v_reader and event_type='book_published';
  if v_row.metadata->>'batch_count' <> '5' or v_row.action_route <> '/creator/'||v_author then raise exception 'R4 batch/idempotency failed'; end if;
  select count(*) into v_n from public.push_deliveries where notification_id=v_row.id;
  if v_n <> 2 then raise exception 'R4 push anti-spam failed'; end if;
  v_new := gen_random_uuid();
  insert into public.books(id,author_id,title,slug,status,visibility)
  values(v_new,v_author2,'Truyện thử tác giả khác','r4-rollback-'||v_new,'ongoing','public');
  select count(*) into v_n from public.notifications where user_id=v_reader and event_type='book_published';
  if v_n <> 2 then raise exception 'R4 separate authors failed'; end if;

  perform public.update_notification_preferences(true,true,true,true,true,true,false,true,true,false);
  -- R1 and pre-R1 clients must preserve opt-out.
  perform public.update_notification_preferences(true,true,true,true,true,true,false,true,true);
  perform public.update_notification_preferences(true,true,true,true,true,true,true,true);
  if (select new_books from public.notification_preferences where user_id=v_reader) then raise exception 'R4 compatibility reset opt-out'; end if;
  v_new := gen_random_uuid();
  insert into public.books(id,author_id,title,slug,status,visibility)
  values(v_new,v_author,'Truyện thử tắt thông báo','r4-rollback-'||v_new,'ongoing','public');
  select count(*) into v_n from public.notifications where user_id=v_reader and event_type='book_published';
  if v_n <> 2 then raise exception 'R4 opt-out failed'; end if;
  select count(*) into v_n from public.push_deliveries d join public.notifications n on n.id=d.notification_id
  where n.user_id=v_reader and n.event_type='book_published';
  if v_n <> 4 then raise exception 'R4 opt-out push failed'; end if;

  insert into public.books(author_id,title,slug,status,visibility,moderation_state) values
    (v_author,'Nháp bí mật','r4-draft-'||v_author,'draft','public','approved'),
    (v_author,'Truyện riêng','r4-private-'||v_author,'ongoing','private','approved'),
    (v_author,'Truyện ẩn','r4-hidden-'||v_author,'ongoing','public','hidden'),
    (v_author,'Truyện từ chối','r4-rejected-'||v_author,'ongoing','public','rejected');
  select count(*) into v_n from public.get_public_author_books(v_author);
  if v_n <> 6 then raise exception 'R4 public catalog eligibility failed: %',v_n; end if;
  perform set_config('request.jwt.claim.sub','',true);
  if (select viewer_follows from public.get_public_author_hub(v_author)) then raise exception 'R4 anonymous follow state failed'; end if;
  if not exists(select 1 from public.get_public_author_hub(v_author)) then raise exception 'R4 anonymous public hub failed'; end if;
  if has_table_privilege('anon','private.author_book_publications','select')
    or has_table_privilege('authenticated','private.author_book_publications','select')
    or has_function_privilege('anon','private.publish_author_book(uuid)','execute')
    or has_function_privilege('authenticated','private.notify_author_book_publish()','execute') then
    raise exception 'R4 private access failed';
  end if;
end;
$test$;
rollback;
select 'PASS: R4 rollback follow/counters, single release, idempotency, batching, push devices, author separation, opt-out/compatibility, public catalog and private permissions' as result;
