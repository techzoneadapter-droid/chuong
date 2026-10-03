-- CHUONG Phase 4F-B: enable hosted scheduler/network extensions for push worker
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
