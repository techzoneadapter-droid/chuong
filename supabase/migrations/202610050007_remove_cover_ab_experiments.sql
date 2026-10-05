-- CHUONG: remove the abandoned cover A/B testing feature completely.
begin;

drop function if exists public.get_author_cover_experiments(uuid);
drop function if exists public.cancel_book_cover_experiment(uuid);
drop function if exists public.finish_book_cover_experiment(uuid,text);
drop function if exists public.start_book_cover_experiment(uuid,text);
drop function if exists public.record_cover_experiment_event(uuid,text,text);
drop function if exists public.get_active_cover_experiments(uuid[],text);
drop function if exists private.cover_experiment_variant(uuid,text);

drop table if exists public.book_cover_experiment_events cascade;
drop table if exists public.book_cover_experiments cascade;

commit;