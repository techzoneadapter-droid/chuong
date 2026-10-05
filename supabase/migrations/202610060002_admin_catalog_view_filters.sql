-- Extend Admin catalog search with view-count range filters.
begin;

drop function if exists public.admin_catalog_search(text,text,text,text,text,integer,integer);

create function public.admin_catalog_search(
  p_query text default null,
  p_author text default null,
  p_genre text default null,
  p_status text default null,
  p_sort text default 'views_desc',
  p_min_views bigint default null,
  p_max_views bigint default null,
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
      and (p_min_views is null or b.views_count >= greatest(p_min_views,0))
      and (p_max_views is null or b.views_count <= greatest(p_max_views,0))
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

revoke all on function public.admin_catalog_search(text,text,text,text,text,bigint,bigint,integer,integer) from public, anon;
grant execute on function public.admin_catalog_search(text,text,text,text,text,bigint,bigint,integer,integer) to authenticated;

commit;
