-- CHUONG Admin Web catalog management.
begin;

create or replace function public.admin_catalog_search(
  p_query text default null,
  p_author text default null,
  p_genre text default null,
  p_status text default null,
  p_sort text default 'views_desc',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  id uuid,
  title text,
  author_name text,
  cover_url text,
  description text,
  status text,
  visibility text,
  source_type text,
  views_count bigint,
  followers_count bigint,
  total_chapters integer,
  rating numeric,
  is_vip boolean,
  price_coins integer,
  tags text[],
  genres text[],
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  with catalog as (
    select
      b.id,
      b.title,
      coalesce(nullif(b.credited_author_name, ''), a.pen_name, 'Chuong') as author_name,
      b.cover_url,
      b.description,
      b.status::text as status,
      b.visibility::text as visibility,
      b.source_type::text as source_type,
      b.views_count,
      b.followers_count,
      b.total_chapters,
      b.rating,
      b.is_vip,
      b.price_coins,
      b.tags,
      coalesce(
        array_agg(distinct bg.genre order by bg.genre) filter (where bg.genre is not null),
        array[]::text[]
      ) as genres,
      b.updated_at
    from public.books b
    left join public.authors a on a.id = b.author_id
    left join public.book_genres bg on bg.book_id = b.id
    where
      (nullif(trim(p_query), '') is null
        or b.title ilike '%' || trim(p_query) || '%'
        or coalesce(b.credited_author_name, '') ilike '%' || trim(p_query) || '%')
      and (nullif(trim(p_author), '') is null
        or coalesce(nullif(b.credited_author_name, ''), a.pen_name, '') ilike '%' || trim(p_author) || '%')
      and (nullif(trim(p_genre), '') is null
        or exists (
          select 1 from public.book_genres bgf
          where bgf.book_id = b.id and bgf.genre = trim(p_genre)
        ))
      and (nullif(trim(p_status), '') is null or b.status::text = trim(p_status))
    group by b.id, a.pen_name
  )
  select
    c.id,c.title,c.author_name,c.cover_url,c.description,c.status,c.visibility,c.source_type,
    c.views_count,c.followers_count,c.total_chapters,c.rating,c.is_vip,c.price_coins,c.tags,c.genres,c.updated_at,
    count(*) over() as total_count
  from catalog c
  order by
    case when p_sort = 'views_asc' then c.views_count end asc nulls last,
    case when p_sort = 'views_desc' then c.views_count end desc nulls last,
    case when p_sort = 'title_asc' then c.title end asc nulls last,
    case when p_sort = 'updated_asc' then c.updated_at end asc nulls last,
    case when p_sort = 'updated_desc' then c.updated_at end desc nulls last,
    case when p_sort = 'followers_desc' then c.followers_count end desc nulls last,
    case when p_sort = 'chapters_desc' then c.total_chapters end desc nulls last,
    c.updated_at desc,
    c.id
  limit greatest(1, least(coalesce(p_limit, 100), 200))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_bulk_edit_books(
  p_book_ids uuid[],
  p_set_author boolean default false,
  p_author text default null,
  p_set_genre boolean default false,
  p_genre text default null,
  p_set_status boolean default false,
  p_status text default null
)
returns table(book_id uuid, success boolean, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.book_status;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if coalesce(array_length(p_book_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_book_ids, 1) > 500 then
    raise exception 'too_many_books';
  end if;

  if p_set_status then
    if p_status not in ('draft','ongoing','completed','paused') then
      raise exception 'invalid_status';
    end if;
    v_status := p_status::public.book_status;
  end if;

  foreach v_id in array p_book_ids loop
    if not exists(select 1 from public.books b where b.id = v_id) then
      book_id := v_id; success := false; message := 'Không tìm thấy truyện'; return next; continue;
    end if;

    if p_set_status and v_status <> 'draft'::public.book_status
       and not exists(
         select 1 from public.chapters c
         where c.book_id = v_id and c.status = 'published'::public.chapter_status
       ) then
      book_id := v_id; success := false; message := 'Chưa có chương đã xuất bản'; return next; continue;
    end if;

    if p_set_author then
      update public.books
      set credited_author_name = coalesce(nullif(trim(p_author), ''), 'Chuong'),
          updated_at = now()
      where id = v_id;
    end if;

    if p_set_genre then
      delete from public.book_genres where book_genres.book_id = v_id;
      insert into public.book_genres(book_id, genre)
      values(v_id, coalesce(nullif(trim(p_genre), ''), 'Khác'));
    end if;

    if p_set_status then
      update public.books
      set status = v_status,
          visibility = case when v_status = 'draft'::public.book_status
            then 'private'::public.book_visibility else 'public'::public.book_visibility end,
          updated_at = now()
      where id = v_id;
    end if;

    book_id := v_id; success := true; message := 'Đã cập nhật'; return next;
  end loop;
end;
$$;

create or replace function public.admin_delete_books(p_book_ids uuid[])
returns table(book_id uuid, deleted boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if coalesce(array_length(p_book_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_book_ids, 1) > 200 then
    raise exception 'too_many_books';
  end if;

  foreach v_id in array p_book_ids loop
    if not exists(select 1 from public.books b where b.id = v_id) then
      book_id := v_id; deleted := false; reason := 'Không tìm thấy truyện'; return next; continue;
    end if;

    if exists(select 1 from public.author_revenue_ledger r where r.book_id = v_id)
       or exists(select 1 from public.book_entitlements e where e.book_id = v_id)
       or exists(select 1 from public.chapter_entitlements e where e.book_id = v_id)
       or exists(select 1 from public.author_gifts g where g.book_id = v_id) then
      book_id := v_id; deleted := false;
      reason := 'Có lịch sử giao dịch/doanh thu nên không thể xóa vĩnh viễn. Hãy chuyển về Riêng tư.';
      return next; continue;
    end if;

    delete from public.books where id = v_id;
    book_id := v_id; deleted := true; reason := 'Đã xóa'; return next;
  end loop;
end;
$$;

revoke all on function public.admin_catalog_search(text,text,text,text,text,integer,integer) from public, anon;
revoke all on function public.admin_bulk_edit_books(uuid[],boolean,text,boolean,text,boolean,text) from public, anon;
revoke all on function public.admin_delete_books(uuid[]) from public, anon;
grant execute on function public.admin_catalog_search(text,text,text,text,text,integer,integer) to authenticated;
grant execute on function public.admin_bulk_edit_books(uuid[],boolean,text,boolean,text,boolean,text) to authenticated;
grant execute on function public.admin_delete_books(uuid[]) to authenticated;

commit;
