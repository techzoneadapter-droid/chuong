-- CHUONG Phase 4C: revenue policy creator FK index
begin;
create index if not exists revenue_share_policies_created_by_idx
  on public.revenue_share_policies (created_by)
  where created_by is not null;
commit;
