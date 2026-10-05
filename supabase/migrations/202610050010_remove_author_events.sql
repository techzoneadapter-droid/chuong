-- CHUONG: remove abandoned author events/contest feature completely.
begin;

drop function if exists public.get_public_author_badges(uuid);
drop function if exists public.get_author_event_leaderboard(uuid,integer);
drop function if exists public.get_author_event_center(uuid);
drop function if exists public.sync_author_event_badge(uuid);
drop function if exists public.join_author_event(uuid);
drop function if exists private.author_event_progress(uuid,uuid);

drop table if exists public.author_badges cascade;
drop table if exists public.author_event_entries cascade;
drop table if exists public.author_events cascade;

commit;