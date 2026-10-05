-- CHUONG Phase 4P1 hardening: only approved, public original event work counts.
begin;

create or replace function private.author_event_progress(
  p_event_id uuid,
  p_author_id uuid
)
returns table (
  words_written bigint,
  chapters_published bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(
      case
        when btrim(coalesce(c.content,'')) = '' then 0
        else cardinality(regexp_split_to_array(btrim(c.content), E'\\s+'))
      end
    ),0)::bigint as words_written,
    count(c.id)::bigint as chapters_published
  from public.author_event_entries en
  join public.author_events e on e.id = en.event_id
  join public.authors a
    on a.id = en.author_id
    and a.moderation_state = 'approved'
  left join public.books b
    on b.author_id = en.author_id
    and b.visibility = 'public'
    and b.status <> 'draft'
    and b.moderation_state = 'approved'
    and (e.source_type_filter is null or b.source_type = e.source_type_filter)
    and (
      e.genre_filter is null
      or exists (
        select 1 from public.book_genres bg
        where bg.book_id = b.id and lower(bg.genre) = lower(e.genre_filter)
      )
    )
  left join public.chapters c
    on c.book_id = b.id
    and c.status = 'published'
    and c.moderation_state = 'approved'
    and c.published_at is not null
    and c.published_at >= greatest(e.starts_at, en.joined_at)
    and c.published_at <= least(now(), e.ends_at)
  where en.event_id = p_event_id
    and en.author_id = p_author_id;
$$;

revoke execute on function private.author_event_progress(uuid,uuid) from public, anon, authenticated;

commit;