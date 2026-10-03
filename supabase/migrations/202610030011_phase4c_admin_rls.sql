-- CHUONG Phase 4C: admin RLS policies for policy/refund/payout operations
begin;

drop policy if exists "admins insert revenue policies" on public.revenue_share_policies;
create policy "admins insert revenue policies" on public.revenue_share_policies
for insert to authenticated
with check ((select private.is_admin()) and created_by = (select auth.uid()));

drop policy if exists "admins update revenue policies" on public.revenue_share_policies;
create policy "admins update revenue policies" on public.revenue_share_policies
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "admins update book entitlements" on public.book_entitlements;
create policy "admins update book entitlements" on public.book_entitlements
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "admins update chapter entitlements" on public.chapter_entitlements;
create policy "admins update chapter entitlements" on public.chapter_entitlements
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "admins update author revenue accounts" on public.author_revenue_accounts;
create policy "admins update author revenue accounts" on public.author_revenue_accounts
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "admins insert author revenue ledger" on public.author_revenue_ledger;
create policy "admins insert author revenue ledger" on public.author_revenue_ledger
for insert to authenticated
with check ((select private.is_admin()));

drop policy if exists "admins insert author payouts" on public.author_payouts;
create policy "admins insert author payouts" on public.author_payouts
for insert to authenticated
with check ((select private.is_admin()) and processed_by = (select auth.uid()));

grant insert, update on public.revenue_share_policies to authenticated;
grant update on public.book_entitlements to authenticated;
grant update on public.chapter_entitlements to authenticated;
grant update on public.author_revenue_accounts to authenticated;
grant insert on public.author_revenue_ledger to authenticated;
grant insert on public.author_payouts to authenticated;

commit;
