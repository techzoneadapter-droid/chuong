# Author VND settlement

Apply `202610050018_author_vnd_settlement.sql` and then `202610050019_author_gift_vnd_policy.sql` after the existing two-tier migration. Deploy these migrations before the new screens. The repository implementation does not apply changes to production.

The initial policy is 60% chapter, 60% book, 80% gift, 0% app subscription, 60% low creator pool, minimum withdrawal 1 VND and zero fee. The high-stone VND rate is deliberately unset. Admin must configure a real payment rate in `/admin/monetization` before payouts can be requested. Leaving that field blank disables new payout requests. A later rate never prices earlier transactions.

Only chapter/book unlock sales and premium gifts create VND source rows. The existing server RPCs still control wallet debits and entitlements. A trigger on their server-generated revenue records adds an immutable VND snapshot. Clients cannot write either revenue ledger. Gift spending, limits, idempotency, gift history and the two currencies remain intact; the gift RPC's policy lookup now uses the new gift share.

High spending snapshots the current policy, integer VND rate, gross value and source-specific share. Low spending records pending consumption with its original pool percentage and no VND amount. Admin closes a UTC period with an actual revenue pool. Allocation uses each eligible transaction's share of consumed low stones and its snapshotted pool percentage, rounding down to whole VND. Historical consumption without a policy uses the audited settlement policy. Refunded or previously settled rows cannot be allocated again. The period records the actual pool and creator allocation; settlement rows reference it.

The dashboard gets totals from an authorized server RPC, rather than deriving balances from paginated client history. Pending consumption displays a transaction/stone count because its VND value is unknown. It contributes nothing to withdrawable VND. Unpriced historical transactions remain `legacy_pending_settlement`.

Payout requests lock the author row, verify available VND after all reservations and paid requests, and snapshot requested amount, fee, net, policy, destination, method, KYC and tax. The request idempotency key is checked under the same lock. Existing profile/compliance, cancellation and Admin review workflows remain in use. Payout destination snapshots are displayed separately from current compliance. Old stone-based payout entry points reject new requests; old requests remain visible without an invented conversion and cannot be marked paid as VND.

Refunds preserve the source and add one reversal of the original settled amount. A settled low reversal targets its settlement row. Reversals after payment create an adjustment/debt through the ledger balance; paid requests keep their original amounts. Future earnings offset debt. Actual bank transfers still take place outside this app; Admin records the transfer reference after approval.

`npm run test:db` runs foundation and economy tests in disposable local PGlite databases, including both new migrations and the existing wallet RPCs. Coverage includes empty gift history, migration of unpriced/refunded history, high chapter/book/gift snapshots, low pending/settlement/refund, forbidden subscription sources, reservations, retries, overlapping requests, cancellation/payment, post-payment debt, policy changes and unchanged purchased entitlements. PGlite serializes overlapping calls; this is not a multi-session production load test. No production connection or financial test data is used.

## Author-visible source separation (2026-10-16)

The server dashboard RPC returns an additive `revenue_channels` object aggregated over **all** matching author ledger entries, not just the most recent 100 transactions:

- `paid_unlock_vnd`: author VND earned from chapters/books unlocked with **Thượng Phẩm** (purchased coins).
- `paid_gift_vnd`: author VND earned from premium-coin gifts; shown separately from paid reading.
- `low_pool_vnd`: author VND allocated from the **Hạ Phẩm** revenue pool after Admin closes an actual revenue period. Hạ Phẩm is acquired via rewarded ads and free quests, so this is **not** a direct per-view AdMob attribution.

The figures include immutable refund/reversal adjustments. Pending low-stone transactions, unpriced historical rows and unused prepaid stones are excluded from earned VND. The total of all three channels must reconcile with `total_vnd`. Payout/reservation math and author share percentages are unchanged. This is a reporting-only server RPC extension.

**Important operational control:** the Admin still manually supplies `actual_revenue_pool_vnd` to settle a period; AdMob income is not automatically imported or authenticated into this ledger. Admin must reconcile with **actual reported AdMob revenue** (net of adjustments, and with consistent period boundaries), document the basis for author allocations and not present the low-stone pool as guaranteed money before settlement. If an app-side database migration is not yet deployed, the author page shows a clear pending-report message rather than estimating lifetime income from paginated recent rows.

Migration: `202610160001_author_revenue_channels.sql`. Apply and verify this read-only RPC update before treating the three totals as live; verify the same RPC's author-only access and ledger reconciliation with `npm run test:db`.
