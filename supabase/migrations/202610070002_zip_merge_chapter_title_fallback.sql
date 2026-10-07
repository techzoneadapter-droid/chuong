-- Make ZIP chapter merge compatible with publication validation:
-- existing blank incoming titles keep their old title; new blank titles get "Chương N".
begin;

create or replace function public.admin_merge_zip_book(
  p_book_id uuid,
  p_title text,
  p_author text,
  p_summary text,
  p_genres text[],
  p_status text,
  p_source_type text,
  p_publish_now boolean,
  p_chapters jsonb
)
returns table(
  run_id uuid,
  book_id uuid,
  replaced_chapters integer,
  added_chapters integer,
  total_chapters integer
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run uuid:=gen_random_uuid();
  v_item jsonb;
  v_number integer;
  v_title text;
  v_storage_title text;
  v_content text;
  v_existing public.chapters%rowtype;
  v_replaced integer:=0;
  v_added integer:=0;
  v_total integer:=0;
  v_genres text[];
  v_allowed constant text[]:=array[
    'Xuyên không','Trọng sinh','Hệ thống','Tiên hiệp','Huyền huyễn','Mạt thế',
    'Đam mỹ','Ngôn tình','Cổ đại','Cung đấu','Đô thị','Giới giải trí',
    'Huyền học','Trinh thám','Kinh dị','Khoa huyễn','Esports','Kiếm hiệp',
    'Fantasy','Điền văn','Vô hạn lưu','Niên đại','Văn học','Khác'
  ];
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if not exists(select 1 from public.books b where b.id=p_book_id) then
    raise exception 'book_not_found';
  end if;
  if jsonb_typeof(p_chapters)<>'array' or jsonb_array_length(p_chapters)=0 then
    raise exception 'chapters_required';
  end if;
  if jsonb_array_length(p_chapters)>5000 then raise exception 'too_many_chapters'; end if;

  update public.books b
  set title=coalesce(nullif(trim(p_title),''),b.title),
      credited_author_name=case
        when nullif(trim(coalesce(p_author,'')),'') is null then b.credited_author_name
        when nullif(trim(coalesce(b.credited_author_name,'')),'') is null
          or lower(trim(b.credited_author_name))='chuong'
          then trim(p_author)
        else b.credited_author_name
      end,
      description=case
        when nullif(trim(coalesce(p_summary,'')),'') is not null
          and (trim(coalesce(b.description,''))='' or b.description='Hãy khám phá.')
          then trim(p_summary)
        else b.description
      end,
      source_type=coalesce(nullif(trim(p_source_type),'')::public.source_type,b.source_type),
      status=case when p_publish_now then coalesce(nullif(trim(p_status),'')::public.book_status,b.status) else b.status end,
      visibility=case when p_publish_now then 'public'::public.book_visibility else b.visibility end,
      updated_at=now()
  where b.id=p_book_id;

  select coalesce(array_agg(distinct g order by g),array[]::text[])
  into v_genres
  from (
    select trim(g) as g
    from unnest(coalesce(p_genres,array[]::text[])) g
    where trim(g)=any(v_allowed)
    limit 3
  ) x;

  if coalesce(array_length(v_genres,1),0)>0 then
    delete from public.book_genres bg where bg.book_id=p_book_id;
    insert into public.book_genres(book_id,genre)
    select p_book_id,g from unnest(v_genres) g;
  end if;

  for v_item in select value from jsonb_array_elements(p_chapters) loop
    v_number:=coalesce((v_item->>'chapterNumber')::integer,(v_item->>'chapter_number')::integer);
    v_title:=trim(coalesce(v_item->>'title',''));
    v_content:=coalesce(v_item->>'content','');

    if v_number is null or v_number<1 then raise exception 'invalid_chapter_number'; end if;
    if trim(v_content)='' then raise exception 'empty_chapter_%',v_number; end if;

    select * into v_existing
    from public.chapters c
    where c.book_id=p_book_id and c.chapter_number=v_number
    for update;

    if found then
      insert into private.chapter_zip_update_backups(
        run_id,admin_user_id,book_id,chapter_id,chapter_number,
        original_title,original_content,original_status,original_published_at
      ) values (
        v_run,auth.uid(),p_book_id,v_existing.id,v_existing.chapter_number,
        v_existing.title,v_existing.content,v_existing.status,v_existing.published_at
      );

      update public.chapters c
      set title=case when v_title<>'' then v_title else c.title end,
          content=v_content,
          status=case when p_publish_now then 'published'::public.chapter_status else c.status end,
          published_at=case when p_publish_now then coalesce(c.published_at,now()) else c.published_at end,
          updated_at=now()
      where c.id=v_existing.id;
      v_replaced:=v_replaced+1;
    else
      v_storage_title:=coalesce(nullif(v_title,''),'Chương '||v_number::text);
      insert into public.chapters(
        book_id,chapter_number,title,content,status,is_vip,price_coins,published_at
      ) values (
        p_book_id,v_number,v_storage_title,v_content,
        case
          when p_publish_now and char_length(trim(v_content))>=50 then 'published'::public.chapter_status
          else 'draft'::public.chapter_status
        end,
        false,0,
        case when p_publish_now and char_length(trim(v_content))>=50 then now() else null end
      );
      v_added:=v_added+1;
    end if;
  end loop;

  select count(*)::integer into v_total from public.chapters c where c.book_id=p_book_id;
  update public.books b set total_chapters=v_total,updated_at=now() where b.id=p_book_id;

  return query select v_run,p_book_id,v_replaced,v_added,v_total;
end;
$$;

revoke all on function public.admin_merge_zip_book(uuid,text,text,text,text[],text,text,boolean,jsonb) from public,anon;
grant execute on function public.admin_merge_zip_book(uuid,text,text,text,text[],text,text,boolean,jsonb) to authenticated;

commit;
