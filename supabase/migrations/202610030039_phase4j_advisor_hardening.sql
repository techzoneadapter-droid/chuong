-- CHUONG Phase 4J: explicit direct-access deny policies and FK index hardening
begin;

create index if not exists chapter_engagement_daily_chapter_date_idx
  on public.chapter_engagement_daily (chapter_id, metric_date desc);

drop policy if exists "analytics sessions are system only" on public.reader_engagement_sessions;
create policy "analytics sessions are system only"
on public.reader_engagement_sessions
for select to anon, authenticated
using (false);

drop policy if exists "reader book days are system only" on public.reader_book_days;
create policy "reader book days are system only"
on public.reader_book_days
for select to anon, authenticated
using (false);

drop policy if exists "reader chapter days are system only" on public.reader_chapter_days;
create policy "reader chapter days are system only"
on public.reader_chapter_days
for select to anon, authenticated
using (false);

commit;
