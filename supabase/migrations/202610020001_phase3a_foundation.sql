-- CHƯƠNG Phase 3A backend foundation
create extension if not exists pgcrypto;

create type public.user_role as enum ('reader', 'author', 'admin');
create type public.book_status as enum ('draft', 'ongoing', 'completed', 'paused');
create type public.chapter_status as enum ('draft', 'published');
create type public.book_visibility as enum ('public', 'private', 'unlisted');
create type public.source_type as enum ('original', 'licensed_translation', 'authorized');
create type public.library_status as enum ('reading', 'favorite', 'completed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username is null or username ~ '^[a-zA-Z0-9_]{3,30}$'),
  display_name text check (char_length(display_name) <= 80),
  avatar_url text,
  bio text check (char_length(bio) <= 500),
  role public.user_role not null default 'reader',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.authors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  pen_name text not null check (char_length(trim(pen_name)) between 2 and 80),
  bio text check (char_length(bio) <= 1000),
  avatar_url text,
  followers_count bigint not null default 0 check (followers_count >= 0),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 180),
  slug text not null unique,
  description text not null default '',
  cover_url text,
  language text not null default 'vi',
  source_type public.source_type not null default 'original',
  status public.book_status not null default 'draft',
  visibility public.book_visibility not null default 'private',
  is_vip boolean not null default false,
  price_coins integer not null default 0 check (price_coins >= 0),
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  views_count bigint not null default 0 check (views_count >= 0),
  followers_count bigint not null default 0 check (followers_count >= 0),
  total_chapters integer not null default 0 check (total_chapters >= 0),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.book_genres (
  book_id uuid not null references public.books(id) on delete cascade,
  genre text not null check (char_length(trim(genre)) between 1 and 60),
  primary key (book_id, genre)
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_number integer not null check (chapter_number > 0),
  title text not null check (char_length(trim(title)) between 1 and 180),
  content text not null default '',
  status public.chapter_status not null default 'draft',
  is_vip boolean not null default false,
  price_coins integer not null default 0 check (price_coins >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, chapter_number)
);

create table public.library (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  status public.library_status not null default 'reading',
  added_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table public.reading_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  chapter_number integer not null check (chapter_number > 0),
  progress_percent numeric(5,2) not null default 0 check (progress_percent between 0 and 100),
  scroll_position numeric not null default 0 check (scroll_position >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  chapter_number integer not null check (chapter_number > 0),
  position numeric not null default 0 check (position >= 0),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, book_id, chapter_number, position)
);

create table public.author_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.authors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, author_id)
);

create table public.book_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comment_likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  primary key (user_id, comment_id)
);

create table public.downloads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  downloaded_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

insert into public.profiles (id, display_name, created_at, updated_at)
select id, nullif(raw_user_meta_data->>'display_name', ''), created_at, now()
from auth.users
on conflict (id) do nothing;

create index books_public_updated_idx on public.books (visibility, status, updated_at desc);
create index books_author_idx on public.books (author_id, updated_at desc);
create index chapters_book_status_number_idx on public.chapters (book_id, status, chapter_number);
create index library_user_status_idx on public.library (user_id, status, added_at desc);
create index progress_user_updated_idx on public.reading_progress (user_id, updated_at desc);
create index bookmarks_user_book_idx on public.bookmarks (user_id, book_id, created_at desc);
create index comments_book_created_idx on public.comments (book_id, created_at desc);
create index comments_chapter_created_idx on public.comments (chapter_id, created_at desc);
create index author_follows_author_idx on public.author_follows (author_id);
create index book_follows_book_idx on public.book_follows (book_id);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger books_updated_at before update on public.books for each row execute function public.set_updated_at();
create trigger chapters_updated_at before update on public.chapters for each row execute function public.set_updated_at();
create trigger comments_updated_at before update on public.comments for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, nullif(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.protect_profile_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = old.role then return new; end if;
  if new.role = 'author' and old.role = 'reader' and exists (select 1 from public.authors where user_id = old.id) then return new; end if;
  if coalesce(auth.jwt()->>'role', '') = 'service_role' then return new; end if;
  raise exception 'role changes are managed by the platform';
end;
$$;
create trigger profiles_protect_role before update of role on public.profiles for each row execute function public.protect_profile_role();

create or replace function public.protect_author_metrics() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' and pg_trigger_depth() = 1 then
    new.followers_count = old.followers_count;
    new.verified = old.verified;
  end if;
  return new;
end;
$$;
create trigger authors_protect_metrics before update on public.authors for each row execute function public.protect_author_metrics();

create or replace function public.protect_book_metrics() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' and pg_trigger_depth() = 1 then
    new.rating = old.rating;
    new.views_count = old.views_count;
    new.followers_count = old.followers_count;
    new.total_chapters = old.total_chapters;
  end if;
  return new;
end;
$$;
create trigger books_protect_metrics before update on public.books for each row execute function public.protect_book_metrics();

create or replace function public.refresh_book_chapter_count() returns trigger language plpgsql security definer set search_path = public as $$
declare target_book uuid;
begin
  target_book := case when tg_op = 'DELETE' then old.book_id else new.book_id end;
  update public.books set total_chapters = (select count(*) from public.chapters where book_id = target_book and status = 'published') where id = target_book;
  return null;
end;
$$;
create trigger chapters_refresh_count after insert or update or delete on public.chapters for each row execute function public.refresh_book_chapter_count();

create or replace function public.refresh_follow_count() returns trigger language plpgsql security definer set search_path = public as $$
declare target_id uuid;
begin
  if tg_table_name = 'author_follows' then
    target_id := case when tg_op = 'DELETE' then old.author_id else new.author_id end;
    update public.authors set followers_count = (select count(*) from public.author_follows where author_id = target_id) where id = target_id;
  else
    target_id := case when tg_op = 'DELETE' then old.book_id else new.book_id end;
    update public.books set followers_count = (select count(*) from public.book_follows where book_id = target_id) where id = target_id;
  end if;
  return null;
end;
$$;
create trigger author_follows_refresh_count after insert or delete on public.author_follows for each row execute function public.refresh_follow_count();
create trigger book_follows_refresh_count after insert or delete on public.book_follows for each row execute function public.refresh_follow_count();

alter table public.profiles enable row level security;
alter table public.authors enable row level security;
alter table public.books enable row level security;
alter table public.book_genres enable row level security;
alter table public.chapters enable row level security;
alter table public.library enable row level security;
alter table public.reading_progress enable row level security;
alter table public.bookmarks enable row level security;
alter table public.author_follows enable row level security;
alter table public.book_follows enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.downloads enable row level security;

create policy "profiles are readable" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "authors are readable" on public.authors for select using (true);
create policy "users create own author profile" on public.authors for insert with check (auth.uid() = user_id);
create policy "authors update own profile" on public.authors for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "public or owned books are readable" on public.books for select using (
  (visibility = 'public' and status <> 'draft') or exists (select 1 from public.authors a where a.id = author_id and a.user_id = auth.uid())
);
create policy "authors create own books" on public.books for insert with check (exists (select 1 from public.authors a where a.id = author_id and a.user_id = auth.uid()));
create policy "authors update own books" on public.books for update using (exists (select 1 from public.authors a where a.id = author_id and a.user_id = auth.uid())) with check (exists (select 1 from public.authors a where a.id = author_id and a.user_id = auth.uid()));
create policy "authors delete own books" on public.books for delete using (exists (select 1 from public.authors a where a.id = author_id and a.user_id = auth.uid()));

create policy "genres follow book visibility" on public.book_genres for select using (exists (select 1 from public.books b where b.id = book_id and ((b.visibility = 'public' and b.status <> 'draft') or exists (select 1 from public.authors a where a.id = b.author_id and a.user_id = auth.uid()))));
create policy "authors manage own genres" on public.book_genres for all using (exists (select 1 from public.books b join public.authors a on a.id = b.author_id where b.id = book_id and a.user_id = auth.uid())) with check (exists (select 1 from public.books b join public.authors a on a.id = b.author_id where b.id = book_id and a.user_id = auth.uid()));

create policy "published or owned chapters are readable" on public.chapters for select using (
  (status = 'published' and exists (select 1 from public.books b where b.id = book_id and b.visibility = 'public' and b.status <> 'draft'))
  or exists (select 1 from public.books b join public.authors a on a.id = b.author_id where b.id = book_id and a.user_id = auth.uid())
);
create policy "authors create chapters for own books" on public.chapters for insert with check (exists (select 1 from public.books b join public.authors a on a.id = b.author_id where b.id = book_id and a.user_id = auth.uid()));
create policy "authors update chapters for own books" on public.chapters for update using (exists (select 1 from public.books b join public.authors a on a.id = b.author_id where b.id = book_id and a.user_id = auth.uid())) with check (exists (select 1 from public.books b join public.authors a on a.id = b.author_id where b.id = book_id and a.user_id = auth.uid()));
create policy "authors delete chapters for own books" on public.chapters for delete using (exists (select 1 from public.books b join public.authors a on a.id = b.author_id where b.id = book_id and a.user_id = auth.uid()));

create policy "users manage own library" on public.library for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own progress" on public.reading_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own bookmarks" on public.bookmarks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "follows are readable" on public.author_follows for select using (true);
create policy "users manage own author follows" on public.author_follows for insert with check (auth.uid() = user_id);
create policy "users delete own author follows" on public.author_follows for delete using (auth.uid() = user_id);
create policy "book follows are readable" on public.book_follows for select using (true);
create policy "users manage own book follows" on public.book_follows for insert with check (auth.uid() = user_id);
create policy "users delete own book follows" on public.book_follows for delete using (auth.uid() = user_id);

create policy "comments on public books are readable" on public.comments for select using (exists (select 1 from public.books b where b.id = book_id and b.visibility = 'public' and b.status <> 'draft'));
create policy "users create comments as themselves" on public.comments for insert with check (auth.uid() = user_id);
create policy "users update own comments" on public.comments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own comments" on public.comments for delete using (auth.uid() = user_id);
create policy "comment likes are readable" on public.comment_likes for select using (true);
create policy "users add own comment likes" on public.comment_likes for insert with check (auth.uid() = user_id);
create policy "users delete own comment likes" on public.comment_likes for delete using (auth.uid() = user_id);
create policy "users manage own downloads" on public.downloads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-covers', 'book-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('author-avatars', 'author-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "book covers are public" on storage.objects for select using (bucket_id = 'book-covers');
create policy "authors upload own covers" on storage.objects for insert to authenticated with check (
  bucket_id = 'book-covers' and exists (select 1 from public.authors a where a.id::text = (storage.foldername(name))[1] and a.user_id = auth.uid())
);
create policy "authors update own covers" on storage.objects for update to authenticated using (
  bucket_id = 'book-covers' and exists (select 1 from public.authors a where a.id::text = (storage.foldername(name))[1] and a.user_id = auth.uid())
) with check (
  bucket_id = 'book-covers' and exists (select 1 from public.authors a where a.id::text = (storage.foldername(name))[1] and a.user_id = auth.uid())
);
create policy "authors delete own covers" on storage.objects for delete to authenticated using (
  bucket_id = 'book-covers' and exists (select 1 from public.authors a where a.id::text = (storage.foldername(name))[1] and a.user_id = auth.uid())
);
create policy "author avatars are public" on storage.objects for select using (bucket_id = 'author-avatars');
create policy "authors upload own avatar" on storage.objects for insert to authenticated with check (
  bucket_id = 'author-avatars' and exists (select 1 from public.authors a where a.id::text = (storage.foldername(name))[1] and a.user_id = auth.uid())
);
create policy "authors update own avatar" on storage.objects for update to authenticated using (
  bucket_id = 'author-avatars' and exists (select 1 from public.authors a where a.id::text = (storage.foldername(name))[1] and a.user_id = auth.uid())
) with check (
  bucket_id = 'author-avatars' and exists (select 1 from public.authors a where a.id::text = (storage.foldername(name))[1] and a.user_id = auth.uid())
);
create policy "authors delete own avatar" on storage.objects for delete to authenticated using (
  bucket_id = 'author-avatars' and exists (select 1 from public.authors a where a.id::text = (storage.foldername(name))[1] and a.user_id = auth.uid())
);
create policy "profile avatars are public" on storage.objects for select using (bucket_id = 'profile-avatars');
create policy "users upload own avatar" on storage.objects for insert to authenticated with check (
  bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "users update own avatar" on storage.objects for update to authenticated using (
  bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "users delete own avatar" on storage.objects for delete to authenticated using (
  bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
