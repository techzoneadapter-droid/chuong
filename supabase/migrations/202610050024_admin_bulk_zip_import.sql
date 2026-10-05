-- CHUONG: bulk ZIP import provenance and duplicate-file protection.
begin;

alter table public.admin_import_logs
  add column if not exists source_sha256 text,
  add column if not exists source_size_bytes bigint,
  add column if not exists batch_id uuid,
  add column if not exists relative_path text;

alter table public.admin_import_logs
  drop constraint if exists admin_import_logs_source_sha256_check;
alter table public.admin_import_logs
  add constraint admin_import_logs_source_sha256_check
  check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$');

alter table public.admin_import_logs
  drop constraint if exists admin_import_logs_source_size_check;
alter table public.admin_import_logs
  add constraint admin_import_logs_source_size_check
  check (source_size_bytes is null or source_size_bytes >= 0);

create unique index if not exists admin_import_logs_completed_source_sha_uq
  on public.admin_import_logs(source_sha256)
  where status = 'completed' and source_sha256 is not null;

create index if not exists admin_import_logs_batch_idx
  on public.admin_import_logs(batch_id, created_at desc)
  where batch_id is not null;

commit;
