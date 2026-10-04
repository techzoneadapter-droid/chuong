-- Restore chapter reads for readers and admin/editor screens.
-- Row-level security still controls which chapters each role may see.
grant select on table public.chapters to anon, authenticated;
