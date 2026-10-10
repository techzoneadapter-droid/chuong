-- Deploy only after client and admin UI are ready. Server is authoritative.
alter table public.books
  add column if not exists free_preview_chapters integer not null default 0;
alter table public.books
  drop constraint if exists books_free_preview_chapters_range;
alter table public.books
  add constraint books_free_preview_chapters_range
    check (free_preview_chapters between 0 and 100000);

-- Keep security-definer implementation and all original publication/moderation
-- guards. A preview grants read access, never a paid entitlement.
create or replace function private.get_chapter_for_reading_impl(
  p_book_id uuid, p_chapter_number integer
)
returns table(
  id uuid, book_id uuid, chapter_number integer, title text,
  content text, status public.chapter_status, is_vip boolean,
  price_coins integer, published_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  lock_kind text, lock_price_coins integer
)
language plpgsql stable security definer
set search_path to ''
as $function$
declare
  v_chapter public.chapters%rowtype;
  v_book public.books%rowtype;
  v_author public.authors%rowtype;
  v_user uuid := (select auth.uid());
  v_owner boolean := false;
  v_admin boolean := false;
  v_allowed boolean := false;
  v_lock_kind text := null;
  v_lock_price integer := 0;
  v_is_preview boolean := false;
begin
  select * into v_chapter from public.chapters c
  where c.book_id = p_book_id and c.chapter_number = p_chapter_number;
  if not found then return; end if;

  select * into v_book from public.books b where b.id = v_chapter.book_id;
  select * into v_author from public.authors a where a.id = v_book.author_id;
  v_owner := v_user is not null and v_author.user_id = v_user;
  v_admin := v_user is not null and exists (
    select 1 from public.profiles p
    where p.id = v_user and p.role = 'admin'
  );
  v_is_preview := v_chapter.chapter_number between 1 and v_book.free_preview_chapters;

  if v_owner or v_admin then
    v_allowed := true;
  elsif v_chapter.status = 'published'
    and v_chapter.moderation_state = 'approved'
    and v_book.visibility = 'public'
    and v_book.status <> 'draft'
    and v_book.moderation_state = 'approved'
    and v_author.moderation_state = 'approved' then
    if v_is_preview then
      v_allowed := true;
    elsif v_book.is_vip and v_book.price_coins > 0 then
      v_lock_kind := 'book';
      v_lock_price := v_book.price_coins;
      v_allowed := v_user is not null and exists (
        select 1 from public.book_entitlements e
        where e.user_id = v_user and e.book_id = v_book.id and e.revoked_at is null
      );
    elsif v_chapter.is_vip
      and v_chapter.price_coins > 0
      and (v_chapter.early_access_until is null
           or v_chapter.early_access_until > now()) then
      v_lock_kind := 'chapter';
      v_lock_price := v_chapter.price_coins;
      v_allowed := v_user is not null and (
        exists (
          select 1 from public.book_entitlements e
          where e.user_id = v_user and e.book_id = v_book.id and e.revoked_at is null
        )
        or exists (
          select 1 from public.chapter_entitlements e
          where e.user_id = v_user and e.chapter_id = v_chapter.id and e.revoked_at is null
        )
      );
    else
      v_allowed := true;
    end if;
  end if;

  if not v_allowed then
    if v_lock_kind is not null then
      return query select v_chapter.id, v_chapter.book_id,
        v_chapter.chapter_number, v_chapter.title, null::text,
        v_chapter.status, v_chapter.is_vip, v_chapter.price_coins,
        v_chapter.published_at, v_chapter.created_at, v_chapter.updated_at,
        v_lock_kind, v_lock_price;
      return;
    end if;
    return;
  end if;

  return query select v_chapter.id, v_chapter.book_id,
    v_chapter.chapter_number, v_chapter.title, v_chapter.content,
    v_chapter.status, v_chapter.is_vip, v_chapter.price_coins,
    v_chapter.published_at, v_chapter.created_at, v_chapter.updated_at,
    null::text, 0::integer;
end;
$function$;
