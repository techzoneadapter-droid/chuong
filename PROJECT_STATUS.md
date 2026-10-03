# CHƯƠNG — PROJECT STATUS

Updated: 2026-10-02

## Live Supabase production backend

- Production Supabase project created: `chuong` (`lwchpifeahyuoajeidsa`) in `ap-southeast-1` (Singapore).
- Project URL: `https://lwchpifeahyuoajeidsa.supabase.co`.
- Applied migrations: `phase3a_foundation`, `phase3a_stabilization`, and `scale_hardening`.
- All 13 application tables have RLS enabled.
- Storage buckets verified: `book-covers`, `author-avatars`, `profile-avatars`.
- Supabase security advisor currently reports no security lints.
- Scale hardening wraps `auth.uid()` in init plans, adds covering foreign-key indexes, removes the duplicate permissive genre SELECT policy, and pins function search paths.
- Performance advisor now only reports unused-index informational notices, which are expected on a brand-new empty database before production traffic.

## Current phase

Phase 3A backend foundation audited, completed in the working tree, and stabilized with local database/browser tests. Live Supabase setup and device QA remain required before declaring deployment complete. Approved Phase 2 UI, Reader, AI demo and Audio demo are preserved.

## Completed

- Audited existing services, routes, types and original migration; initial findings are in `docs/PHASE3A_AUDIT.md`.
- Added the missing book/chapter repository methods while retaining existing service exports for route compatibility.
- Public chapter lists load metadata in pages; Reader fetches the selected chapter content and navigates actual published chapter numbers, including gaps.
- Book Detail, Home and Reader show loading/retry/not-found states instead of substituting fictional books after backend errors.
- Cloud/local library statuses, remove/add, progress, bookmarks and optimistic follow actions remain functional. Added library continue-reading and opt-in local library import that preserves existing remote rows and skips demo IDs.
- Reader progress writes are serialized, throttled to dirty snapshots every four seconds, and flushed on chapter change, navigation blur, backgrounding and unmount. Book Detail resumes the saved chapter; library progress uses published chapter order.
- Added real book/chapter comments with posting, one-level replies, derived likes, own deletion, login gates and a clearly unsent report placeholder.
- Author onboarding is retry-safe; the database atomically promotes the account role. Studio clears stale account state, retries errors, and derives draft/published/completed/chapter/follower metrics from actual rows.
- Create Book requires explicit copyright confirmation and always creates a private draft. Publication/lifecycle controls live in the existing chapter management screen.
- Chapter editor serializes autosave and explicit saves, prevents duplicate inserts and empty publication, updates publication state only after success, flushes drafts on leaving, and deletes drafts only.
- Cover uploads validate MIME/size, use owned user/book folders and unique filenames, and support preview, replacement and old-cover cleanup. Avatar architecture is retained.
- Added `SUPABASE_SETUP.md` with simple Vietnamese setup and verification instructions.
- No paid AI, billing, ads, scraping, moderation panel or push notifications were implemented.

## Supabase architecture

`lib/supabase.ts` reads only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Missing/invalid URL configuration yields Demo Mode. Web uses Supabase's browser persistence; Android/iOS use AsyncStorage, URL polyfills and lifecycle token refresh. Network requests have a 15-second timeout. Services use typed database contracts and Vietnamese error adapters; raw SQL/provider errors are not displayed.

## Auth and profiles

Email/password registration, login, logout, session restore, forgot-password request and web password reset at `/auth/reset` are implemented. Signup triggers create profiles; authenticated recovery safely inserts a missing reader profile without overwriting an existing role. Profile editing saves display name, username, bio and uploaded avatar. Profile requests are protected against account-switch races. Google/Apple provider contracts remain disabled for a later phase.

## Database and RLS

The original `202610020001_phase3a_foundation.sql` is unchanged. New additive migration `202610020002_phase3a_stabilization.sql` fixes publication validation/timestamps, onboarding role promotion/backfill, insert metric spoofing, atomic chapter/follow counters with one-time reconciliation, invalid publication repair, comment/reference integrity, draft-only deletion and cover ownership. All 13 application tables retain RLS. Public readers cannot read drafts/private books. Account data is owner-scoped, authors can only mutate their own works, and comments/likes enforce identity and visible targets. Admin role escalation is restricted; no admin panel is included.

The database test applies both migrations to an embedded PostgreSQL engine with Supabase auth/storage fixtures. This validates SQL and RLS locally; it does not apply migrations to a hosted project or reproduce its full GoTrue/Storage runtime.

## Reader sync

Anonymous library/progress/bookmarks persist through AsyncStorage (browser local storage on web). Authenticated data uses Supabase. Chapter exit/navigation flush and restored progress are browser-tested using mocked REST. Cloud writes on abrupt browser/process termination remain best-effort; normal Reader navigation flushes are awaited by the write queue. Import is explicit and currently covers library entries only; remote progress/bookmarks are never automatically overwritten.

## Author flow and storage

Onboarding → private book draft → debounced chapter draft → explicit chapter publication → explicit book visibility/status works through the current Author Studio/routes. Direct author editor access verifies ownership. Studio metrics are schema-derived, not fabricated analytics. New cover paths are `userId/bookId/unique-file.ext`; cover objects are immutable uploads and replaced by new files. Existing legacy author-folder covers still display; unused legacy files require administrative cleanup. Storage buckets and policies are created by the migrations.

## Demo mode

With credentials absent: Home, Discover, book/chapter lists, Reader, AI and Audio demos render; anonymous library/progress/bookmarks persist. Auth screens explain setup instead of crashing. Author onboarding/create/editor forms are inspectable but do not pretend to save server data or authenticate a fictional account.

## Validation

- `npm install`: passed; lockfile updated for test tools and native URL polyfill.
- `npx expo install --check`: dependencies compatible; `--fix` unnecessary.
- `npm run typecheck`: passed.
- `npm run build`: web export passed without Supabase credentials.
- `npm run web -- --port 3001`: Demo Mode preview started successfully.
- `npm run test:db`: migration/RLS/signup/role/publication/counter/reference/comment/storage tests passed.
- Playwright Demo Mode: three tests passed, covering all 17 requested route URLs, 390px mobile layout, no JS runtime errors/overflow, library/bookmark/progress persistence and Reader settings/audio.
- Playwright configured mode with mocked Supabase REST: four tests passed for real-content rendering, sparse chapter navigation, missing-book errors, restored account/profile, exit progress writes, logout/login and autosave/publication rollback.
- Android Metro export passed; this verifies bundling, not Android device interaction.
- `git diff --check`: passed.

Browser dependencies/fonts were downloaded into ignored `.cache/` inside the repository. No credentials or environment files were read. Test artifacts, bundles, node_modules and Vibaocode runtime files are excluded from intended source changes.

## Manual Supabase setup required

1. Follow `SUPABASE_SETUP.md`: create/select the project, set the two public environment values, apply pending migrations in order.
2. Verify the three storage buckets/policies and Email auth/confirmation/redirect/SMTP configuration.
3. Register two real accounts; test confirmation, password recovery, author publishing, private drafts, cross-account denial and cross-device library/progress/bookmark sync.
4. Verify avatar/cover picking, session persistence and Reader backgrounding on physical Android/iOS devices.

## Known issues / deliberate limits

- Hosted Supabase, email delivery, actual Storage upload and physical devices were not tested; no live credentials were used.
- Comments currently display at most the first 100 comments/replies per discussion. Advanced pagination/moderation/report submission are later work.
- Web password recovery is implemented; native recovery deep links need a later release/device test.
- Reader page mode, AI, Audio and downloads retain their approved demo behavior; no paid APIs or downloads backend is claimed.
- `npm audit` reports 18 dependency advisories (12 moderate, 6 high) in the existing Expo dependency tree. Suggested automated fixes change/downgrade SDK versions; no forced SDK migration was performed in this backend task.
- No commit or push was performed: the user's sandbox instruction explicitly prohibits both. Product changes, including new files, remain ready for review. Pre-existing untracked `.vibaocode-*` control files are preserved.

## Current origin/main SHA

Local `HEAD` and local `origin/main` ref both remain `9f6724f08c98eed6e69d7ea3cb7c5ca3d9ec1a3b`. Remote was not fetched or changed during this session.

## Exact next task

Review the working tree, then perform the live two-account Supabase/device verification above. Begin with the pending additive migration and environment/auth settings in `SUPABASE_SETUP.md`. After successful review and from an environment authorized to publish, include the new app/components/hooks/services/docs/tests/migration files, commit intended source only, push main and verify the remote SHA. Do not include `.vibaocode-*`, `.env*`, `.cache`, node_modules, dist or test artifacts. Dependency advisory remediation should be a separate Expo compatibility change.


## Live backend connection verification

- The app client now defaults to the production Supabase project `lwchpifeahyuoajeidsa` using the project URL and Supabase publishable client key; environment variables can still override it for staging/key rotation.
- Set `EXPO_PUBLIC_SUPABASE_MODE=demo` to force Demo Mode explicitly.
- Database TypeScript definitions were regenerated from the live Supabase schema.
- Live RLS integration test passed with two temporary accounts:
  - author onboarding promoted `reader -> author`
  - public book/chapter visible to another reader
  - library, reading progress, bookmark and comment writes succeeded
  - book/author follow counters updated atomically
  - non-owner book update was blocked by RLS
  - published chapter counter updated correctly
- All temporary test users/content were deleted after verification; production database remains clean.


## Phase 3B — moderation & admin

Status: implemented on production backend and source.

Completed:
- User reports for books/comments.
- Copyright/plagiarism/spam/harassment/inappropriate/impersonation report reasons.
- Reports queue with open/reviewing/resolved/rejected workflow.
- Admin Center screens: dashboard, report queue, report detail.
- Moderation state for authors, books, chapters and comments.
- Approved/hidden/rejected content states.
- Admin approve/hide/reject actions.
- Public RLS excludes hidden/rejected content.
- Authors retain access to their own moderated content.
- Moderation audit trail in `moderation_actions`.
- Client role escalation is blocked; admin role remains management-controlled.
- Moderation RPCs use SECURITY INVOKER + admin-only RLS.
- Book and comment UI now link to the reporting flow.
- Profile shows Admin Center only for `profile.role = 'admin'`.
- Live production verification passed for report creation, admin handling, content hiding, audit logs and non-admin denial.
- Temporary moderation test data cleaned up.
- Supabase Security Advisor: 0 security lints after hardening.

Migrations:
- `202610030001_phase3b_moderation.sql`
- `202610030002_phase3b_security_hardening.sql`

Manual next step:
- Create the owner's real CHƯƠNG account, then promote that exact profile to `admin` through trusted management tooling.

Exact next product phase:
- Phase 4 monetization design and implementation: CHƯƠNG Xu + compliant Google Play Billing / Apple IAP + author revenue ledger. Do not bypass platform billing.


## Production starter content

To avoid an empty live app while the real catalog is still being built, production Supabase now contains an internal system author `CHƯƠNG Studio` with 4 original demo books and 8 original demo chapters:

- Kiếm Yên Vân — Tiên hiệp
- Thành Phố Sau Mưa — Đô thị
- Người Giữ Ký Ức — Fantasy
- Đêm Thứ Mười Ba — Kinh dị

All content is original demo material created for CHƯƠNG product testing, not scraped or imported copyrighted fiction.

Anonymous/public RLS verification passed:
- 4 public books visible
- 8 published chapters visible


## Phase 4A — CHƯƠNG Xu wallet foundation

Status: implemented on production Supabase and source.

Completed:
- `wallet_accounts`: one wallet per user with non-negative balance, lifetime credited and lifetime spent.
- `wallet_transactions`: immutable signed ledger with balance-after snapshots.
- Unique idempotency keys prevent duplicate credits/debits when the same transaction is retried.
- New profiles automatically receive a zero-balance wallet.
- Existing profiles were backfilled with wallets.
- RLS: users can read only their own wallet/transactions; admins can inspect all wallets.
- Clients cannot directly mutate wallet balances or transaction history.
- Admin-only support adjustment RPC is atomic, row-locked and idempotent.
- Non-admin wallet adjustment attempts are blocked.
- `services/wallet.ts` added.
- `/wallet` screen added with balance, lifetime metrics and transaction history.
- Profile now links to Ví CHƯƠNG.
- "Nạp Xu" is intentionally disabled until compliant Google Play Billing / Apple IAP receipt verification is implemented.

Production verification:
- automatic wallet creation: PASS
- duplicate idempotent credit: PASS (250 Xu credited once)
- duplicate ledger insertion: PASS (one ledger entry)
- owner wallet read: PASS
- non-admin balance adjustment: BLOCKED as expected
- temporary test accounts and ledger entries were removed after verification
- real owner/admin account currently has 0 Xu; no fake balance was added

Migrations:
- `202610030003_phase4a_wallet_foundation.sql`
- `202610030004_phase4a_wallet_security.sql`
- `202610030005_phase4a_wallet_rpc_fix.sql`

Next product step:
- Phase 4B: chapter/book unlock entitlements using CHƯƠNG Xu, with atomic debit + idempotent unlock + author revenue attribution. No store billing yet.


## Phase 4B — VIP entitlements and atomic unlocks

Status: implemented on production Supabase and source.

Completed:
- `book_entitlements` and `chapter_entitlements` store durable ownership of paid content.
- Chapter unlock and whole-book unlock are atomic database operations.
- Wallet rows are locked during purchase to prevent double-spend races.
- Existing entitlements are checked before any debit, so repeated unlock requests do not charge twice.
- Wallet idempotency keys remain enforced.
- Author gross revenue attribution is recorded in `author_revenue_accounts` and `author_revenue_ledger`.
- No author payout percentage is hard-coded yet; Phase 4B records gross attributed sales only so business terms can be chosen later.
- VIP chapter bodies are no longer selectable directly through the public `chapters.content` column.
- Reader chapter bodies are delivered through `get_chapter_for_reading`, which verifies public/moderation state and user entitlement.
- Author editors retain access to their own full chapter bodies through the owner-only `get_author_chapter_for_editing` RPC.
- Reader UI now supports a VIP paywall, wallet balance display, login prompt, insufficient-Xu state, and atomic unlock action.
- Chapter lists show VIP pricing in CHƯƠNG Xu.
- Author chapter editor copy now reflects real Xu-based access.

Production verification with temporary accounts:
- direct authenticated SELECT privilege on `chapters.content`: BLOCKED
- locked VIP metadata visible while content body remains hidden: PASS
- chapter unlock 10 Xu: PASS
- duplicate chapter unlock: no second debit
- whole-book unlock 30 Xu: PASS
- duplicate book unlock: no second debit
- test reader balance 100 -> 60 after exactly 40 Xu of unique purchases
- exactly 2 unlock ledger debits for 2 unique purchases
- 1 chapter entitlement + 1 book entitlement created
- author gross attributed sales: 40 Xu
- author editor retained full body access
- all temporary Phase 4B users/books/entitlements/revenue test rows cleaned afterward

Migrations:
- `202610030006_phase4b_entitlements_unlocks.sql`
- `202610030007_phase4b_index_hardening.sql`
- `202610030008_phase4b_revenue_history_fix.sql`

Next product step:
- Phase 4C: author revenue dashboard, configurable revenue-share policy, refund/reversal accounting, and payout ledger. Do not activate real-money payout until legal/tax/payout requirements are finalized.


## Phase 4C — author revenue, revenue-share policy, refunds and payout ledger

Status: implemented on production Supabase and source.

Completed:
- Versioned `revenue_share_policies` with exactly one active policy at a time.
- Policy changes are forward-only for new sales: every unlock snapshots its policy ID, author basis points, author earnings and platform share.
- No revenue-share percentage is active by default. Admin must explicitly choose and activate one in the app.
- Author revenue accounts now track:
  - gross sales
  - refunded gross
  - accrued author earnings
  - reversed/refunded author earnings
  - paid/externally settled earnings
- Author revenue ledger now stores immutable sale/refund allocation snapshots.
- Admin refund RPC:
  - revokes the entitlement
  - returns the original Xu to the reader
  - creates a `refund_credit` wallet entry
  - reverses the exact original author/platform allocation
  - is idempotent and safe to retry
- Admin payout ledger RPC records a payout only after an external settlement reference exists.
  - It does NOT transfer real money.
  - It prevents recording more than the author’s currently available accrued earnings.
  - It is idempotent.
- Author revenue dashboard added at `/author/revenue`.
- Author Studio links to the revenue dashboard.
- Admin monetization screen added at `/admin/monetization`.
- Admin Center links to the monetization policy screen.
- Real-money withdrawal remains intentionally disabled until KYC/tax/payout requirements are finalized.

Production verification with temporary accounts:
- activated temporary 70% author-share policy for test only
- 20 Xu chapter sale -> author 14 Xu / platform 6 Xu
- refund restored reader wallet and reversed exactly 14 Xu author earnings
- retrying same refund created no second wallet credit
- 50 Xu sale -> author 35 Xu
- recorded 30 Xu external payout -> remaining available author balance 5 Xu
- retrying the same payout created no duplicate payout row
- all temporary users, books, entitlements, revenue rows, payouts and the temporary policy were deleted afterward
- production now has zero active revenue-share policies; no business percentage was chosen automatically

Migrations:
- `202610030009_phase4c_revenue_refunds_payouts.sql`
- `202610030010_phase4c_unlock_revenue_policy.sql`
- `202610030011_phase4c_admin_rls.sql`
- `202610030012_phase4c_index_hardening.sql`

Next product step:
- Phase 4D: compliant mobile store purchase infrastructure for CHƯƠNG Xu:
  - store product catalog
  - Google Play Billing purchase tokens
  - Apple StoreKit transaction IDs
  - server-side receipt verification
  - idempotent wallet credit after verification
  - refund/revocation reconciliation
  - sandbox/test mode before any production money flow


## Phase 4D-A — mobile store purchase foundation

Status: implemented on production Supabase and source; real-money provider verification is intentionally not enabled yet.

Completed:
- Added a visible back button to the Admin Center; it returns to the Profile tab.
- Store catalog table with active Android/iOS product IDs and Xu amounts.
- Initial catalog:
  - 100 Xu -> `chuong.coins.100`
  - 550 Xu -> `chuong.coins.550`
  - 1,200 Xu -> `chuong.coins.1200`
  - 2,600 Xu -> `chuong.coins.2600`
- Store purchase ledger with unique provider transaction IDs and receipt hashes.
- Client cannot insert or credit purchases directly.
- Verified credit RPC is service-role only and idempotent.
- Purchase revocation RPC is service-role only and idempotent.
- Wallet now tracks `debt_coins` and `lifetime_reversed` so a store refund cannot force a negative balance.
- Revocation removes available coins first and converts any unrecoverable amount into Xu debt.
- A later verified top-up repays Xu debt before increasing spendable balance.
- `purchase_reversal_debit` wallet transaction type added.
- Wallet UI shows debt state when present.
- Wallet now opens `/wallet/store`.
- Store screen lists active packages and clearly stays read-only in the Vibaocode/web preview.
- Deployed `iap-verify` Supabase Edge Function with JWT required.
- The Edge Function checks auth and configured catalog products, but deliberately refuses to credit coins until real Google Play / App Store receipt verification credentials and provider verifier logic are enabled.

Production verification with temporary accounts:
- 550 Xu verified purchase credited once.
- Replaying the same provider transaction created no duplicate purchase and no duplicate wallet credit.
- Simulated spend reduced balance to 50 Xu.
- Store revocation removed the remaining 50 Xu and created 500 Xu debt instead of a negative balance.
- A later 1,200 Xu verified purchase repaid the 500 Xu debt first and left 700 Xu spendable.
- All temporary users/purchases/wallet rows were deleted afterward.
- Production currently has 0 real store purchases and 0 wallets with Xu debt.
- The user's active revenue-share policy remains 70% author / 30% platform; Phase 4D did not change it.

Migrations:
- `202610030013_phase4d_wallet_enum.sql`
- `202610030014_phase4d_store_purchase_foundation.sql`

Edge Function:
- `supabase/functions/iap-verify/index.ts`
- deployed as `iap-verify`, JWT verification enabled

Next product step:
- Phase 4D-B: native Android/iOS purchase bridge plus real provider verification:
  - connect Android one-time product purchases
  - connect Apple consumable IAP
  - verify provider response server-side
  - call service-role credit RPC only after verification succeeds
  - finish/consume/acknowledge only through the native purchase flow
  - test Google/Apple sandbox accounts before enabling production money flow


## Currency branding — Linh Thạch

User-facing virtual currency has been renamed from **Xu** to **Linh Thạch**.

Completed:
- Wallet, store, VIP paywall, chapter list, Author Studio, author revenue, admin monetization and service error copy now show Linh Thạch.
- Store product IDs were renamed before production sales:
  - `chuong.linhthach.100`
  - `chuong.linhthach.550`
  - `chuong.linhthach.1200`
  - `chuong.linhthach.2600`
- Internal database field names such as `coins`, `price_coins` and `balance_coins` are intentionally retained as stable implementation details. They are not user-facing branding.
- Existing production revenue policy remains unchanged.

Migration:
- `202610030015_linh_thach_naming.sql`

## Phase 4D-B — native Google Play / Apple IAP bridge

Status: code and server verifier implemented; production purchasing remains safely blocked until real store products and credentials are configured and sandbox tests pass.

Completed:
- Added `expo-iap@5.8.2` and its Expo config plugin.
- Added platform-safe IAP hook:
  - web falls back to read-only catalog
  - Android/iOS uses native IAP
- Mobile purchase requests bind the store purchase to the signed-in Supabase UUID:
  - Google: `obfuscatedAccountId`
  - Apple: `appAccountToken`
- Store screen loads localized store prices when running natively.
- Buy button remains disabled unless both native store connection and server-side provider verification are ready.
- Purchase completion order is fail-safe:
  1. store purchase callback
  2. server verification
  3. idempotent Linh Thạch wallet credit
  4. finish/consume native transaction
- `iap-verify` Edge Function upgraded to version 2.
- Google server verification implementation added using Android Publisher ProductPurchaseV2.
- Apple server verification implementation added using App Store Server API transaction information.
- Exact product ID, account binding, quantity and purchase/revocation state checks are enforced before wallet credit.
- Raw Google purchase tokens are not persisted; a SHA-256 hash is stored.
- Wallet credit RPC remains service-role-only.
- Store credentials are deliberately not embedded in source code.
- Setup guide added at `docs/IAP_SETUP.md`.

Required external setup before native sandbox purchase can be enabled:
- create the four consumable/one-time products in Google Play Console and App Store Connect
- configure Google Play service-account credentials in Supabase Edge Function secrets
- configure Apple App Store Connect issuer/key/private-key credentials in Supabase Edge Function secrets
- run Android and iOS store sandbox tests

App IDs:
- Android: `vn.chuong.app`
- iOS: `vn.chuong.app`

Current safety state:
- Vibaocode/web remains catalog-only.
- If provider verification is not configured, native purchase buttons stay blocked before starting a transaction.
- No real-money purchase is intentionally enabled yet.

Next:
- Configure store-console products and provider secrets.
- Build native Android/iOS test versions.
- Complete sandbox purchase validation.
- Phase 4D-C: Google RTDN / Apple Server Notifications for automatic post-purchase refund and revocation reconciliation.


## Phase 4D-C — post-purchase refund/revocation reconciliation

Status: backend and admin monitoring implemented. External Google/Apple store-console webhook configuration is still required before live events can arrive.

Completed:
- Added `store_webhook_events` immutable audit table with admin-only read access.
- Added idempotent `restore_revoked_store_purchase` RPC for store refund reversals.
- Added `refund_reversal_credit` wallet transaction type.
- Refund reversal restores the exact original purchase value once:
  - repays Linh Thạch debt first
  - credits only the remaining value to spendable balance
  - decreases `lifetime_reversed`
  - returns purchase state from `revoked` to `credited`
- Added `iap-events` Supabase Edge Function for Google/Apple server-to-server events.
- Google RTDN:
  - validates Google OIDC push JWT signature, issuer, audience and service-account email
  - supports one-time purchase completed/canceled events
  - supports voided purchase/full-refund events
  - re-checks ProductPurchaseV2 with Google Play Developer API before wallet changes
  - can credit a completed purchase even if the mobile client disconnected after payment
  - webhook retries are deduplicated by Pub/Sub message ID and purchase transaction ID
- Apple App Store Server Notifications V2:
  - records notification UUIDs for deduplication
  - uses incoming transaction only as a lookup hint
  - performs a fresh authenticated App Store Server API lookup before wallet changes
  - `REFUND` revokes only after Apple confirms revocation
  - `REFUND_REVERSED` restores only after Apple confirms the transaction is no longer revoked
  - `CONSUMPTION_REQUEST` is logged for review rather than automatically influencing Apple's refund decision
- Added Admin Center -> `Thanh toán & đối soát` dashboard:
  - provider verification readiness
  - Google RTDN / Apple notification readiness
  - active Linh Thạch packages
  - purchase/revocation totals
  - failed/processed webhook totals
  - recent webhook events
  - recent store purchases
- `iap-verify` upgraded to expose webhook readiness status.
- Setup instructions updated in `docs/IAP_SETUP.md`.

Production verification with temporary accounts:
- 550 Linh Thạch purchase credited.
- simulated spending left 50 Linh Thạch.
- refund revocation converted the unreturned value into debt.
- refund reversal repaid the debt and returned the wallet to the exact pre-refund economic state.
- retrying the same refund reversal created no duplicate wallet credit or event.
- temporary users, wallet and purchase data were deleted afterward.

Migrations:
- `202610030016_phase4dc_refund_reversal_enum.sql`
- `202610030017_phase4dc_webhook_reconciliation.sql`

Edge Functions:
- `iap-verify` version 3
- `iap-events` version 1

External setup still required:
- Google Play Console RTDN topic + authenticated Pub/Sub push subscription
- Supabase secrets for Google Pub/Sub audience/service-account identity
- Google Play service-account credentials
- App Store Connect Server Notifications V2 URL
- Apple App Store Server API credentials
- native Android/iOS sandbox builds and store test accounts

Next:
- Phase 4E: author withdrawal request workflow, payout-review queue, KYC/tax placeholders, payout status lifecycle, and admin settlement operations.


## Store admin loading bugfix

Issue found from live browser logs:
- `OPTIONS /functions/v1/iap-verify` returned HTTP 405 in Vibaocode/web.
- The Admin -> Thanh toán & đối soát screen therefore failed at the verifier-status request even though its database queries were succeeding.

Fixed:
- `iap-verify` version 4 now handles browser CORS preflight and returns CORS headers.
- The admin store dashboard no longer fails the entire screen if verifier-status lookup is temporarily unavailable; it falls back to “Chưa cấu hình” while still showing database reconciliation data.

## Phase 4E — author payout requests and admin settlement

Status: implemented on production Supabase and source. This is a payout workflow/ledger, not an automated bank-transfer system.

Completed:
- Added `author_payout_profiles`:
  - payout method label
  - masked/non-sensitive destination label
  - KYC status placeholder
  - tax status placeholder
  - admin review metadata
- Extended `author_payouts` with:
  - requester audit
  - reviewer audit
  - review note
  - request snapshot
- Author RPCs:
  - update payout destination label
  - create idempotent payout request
  - cancel pending payout request
- Requestable balance now subtracts pending/approved payout reservations.
- Revenue-account row locking prevents concurrent requests from over-reserving the same earnings.
- Admin RPCs:
  - set KYC/tax workflow status
  - approve/cancel payout request
  - mark approved payout as paid with required external settlement reference
- Approval requires:
  - KYC verified
  - tax verified or not required
  - payout destination configured
- Settlement checks current author earnings again, so a late refund can prevent an unsafe payout.
- Retrying settlement does not increment `paid_out_coins` twice.
- Added author screen `/author/payout`.
- Added admin queue `/admin/payouts`.
- Author revenue screen links to payout requests.
- Admin Center links to author payouts.
- Full identity documents and full bank credentials are intentionally not stored in this phase.

Production verification with temporary accounts:
- seeded 1,000 Linh Thạch of author earnings
- requested 600; duplicate retry created exactly one request
- reservation reduced requestable balance to 400
- admin set KYC verified and tax not required
- admin approved and marked 600 paid with external reference
- retrying mark-paid kept `paid_out_coins` at exactly 600
- author requested remaining 400 then cancelled it
- cancelled request released the reservation, returning requestable balance to 400
- all temporary users/authors/payouts were deleted afterward

Migration:
- `202610030018_phase4e_payout_workflow.sql`

Docs:
- `docs/PAYOUT_WORKFLOW.md`

Next:
- Phase 4F: notifications/inbox for purchase, author earnings, payout status and moderation events; then native push notifications.


## Phase 4F-A — in-app notifications and inbox

Status: implemented on production Supabase and source. Native push delivery is intentionally deferred until device-token and FCM/APNs setup is available.

Completed:
- Added `notification_preferences` with per-category in-app controls and reserved `push_enabled`.
- Added `notifications` inbox table with:
  - category
  - event type
  - title/body
  - deep-link route
  - metadata
  - read timestamp
  - expiry support
  - per-user deterministic dedupe keys
- RLS:
  - users can read only their own notifications/preferences
  - clients cannot directly insert/update/delete notification rows
  - read-state and preference writes go through authenticated RPCs
- Added RPCs:
  - `get_unread_notification_count()`
  - `mark_notification_read()`
  - `mark_all_notifications_read()`
  - `update_notification_preferences()`
- Added database-triggered notification events for:
  - author revenue sale/refund
  - author payout approved/paid/cancelled
  - Linh Thạch purchase credited/revoked/refund-reversed
  - comment replies
  - new top-level comments on an author's book
  - book/chapter/comment moderation changes
  - new reports to admins
  - resolved/rejected reports back to the reporter
- Notification trigger functions fail open: notification problems never roll back core purchase, revenue, payout, comment or moderation transactions.
- Added `/notifications` inbox with:
  - all/unread filters
  - mark-one read on open
  - mark-all read
  - category icons
  - deep-link navigation
- Added `/notifications/settings` with per-category controls.
- Added unread badges:
  - Home bell icon
  - Profile -> Thông báo
- Push notification switch is intentionally disabled until real native push delivery is configured.
- Architecture docs: `docs/NOTIFICATIONS.md`.

Production verification with temporary accounts:
- reader comment created an author notification
- author reply created a reader notification
- author revenue sale created an earnings notification
- payout approval created a payout notification
- book moderation change created a moderation notification
- new report created an admin notification
- resolving the report notified the reporter
- disabling reader comment notifications blocked a later reply notification
- mark-one-read and mark-all-read reduced unread count correctly
- all temporary users, book, comments, preferences and notifications were deleted afterward

Migration:
- `202610030019_phase4f_notifications.sql`

CI:
- notification service, inbox, settings and unread-badge commits passed TypeScript and web export checks

Next:
- Phase 4F-B: native push notifications
  - device-token registry
  - Android FCM / iOS APNs (or Expo Notifications)
  - server push outbox + retries
  - deep-link handling from push
  - invalid token cleanup
  - per-device logout cleanup
  - sandbox device testing
- Then Phase 4G: search, ranking and discovery improvements.


## Phase 4F-B — native Android/iOS push delivery

Status: native client integration, server delivery queue, automated worker and admin monitoring are implemented. Real FCM/APNs delivery still requires an EAS-linked build and store push credentials.

Completed:
- Installed SDK 54 compatible native packages:
  - `expo-notifications ~0.32.17`
  - `expo-device ~8.0.10`
  - `expo-constants ~18.0.14`
- Added `expo-notifications` config plugin.
- Added `eas.json` preview and production profiles.
- Added native push registration service:
  - Android notification channel `chuong-default`
  - OS permission request
  - EAS project ID resolution
  - Expo Push Token acquisition
  - stable per-installation device key
  - authenticated server registration
  - token refresh / foreground best-effort re-sync
  - current-device cleanup before logout
- Added native push lifecycle bridge:
  - foreground display handler
  - push tap deep links through Expo Router
  - cold-start push route handling
- Notification Settings now enables/disables real device push on supported Android/iOS builds.
- Web/Vibaocode clearly reports that remote push requires an Android/iOS build instead of pretending push is available.

Backend:
- Added `push_devices` owner-scoped device registry.
- Added `push_deliveries` durable per-notification/per-device delivery ledger.
- Notification insert trigger queues delivery jobs only when push is enabled for that category.
- Added owner-safe push device registration/unregistration RPCs.
- Added atomic service-role claim function using `FOR UPDATE SKIP LOCKED`.
- Added stale processing-lock recovery.
- Added exponential retry schedule with a six-attempt ceiling.
- Added `push-dispatch` Edge Function:
  - batches up to 100 Expo Push messages
  - stores Expo ticket IDs
  - checks Expo push receipts
  - retries transient/rate-limit errors
  - automatically disables DeviceNotRegistered tokens
- Enabled `pg_cron` + `pg_net`.
- Secure worker secret is generated inside Postgres, stored in Supabase Vault and never committed to git.
- Cron invokes `push-dispatch` every minute using that internal secret.
- Edge Function uses custom worker-secret authentication; gateway JWT verification is intentionally disabled for this worker because the request is authenticated by the generated secret.
- Added Admin Center -> `Hệ thống Push`:
  - worker/cron status
  - active/invalid devices
  - pending/processing/ticketed/delivered/error counts
  - recent devices
  - recent failed/invalid-token deliveries

Production verification:
- temporary authenticated user registered a fake Expo push device through the real RPC
- enabling push created a delivery row for a new notification
- scheduled worker claimed the row
- Expo Push Service returned DeviceNotRegistered for the fake token
- delivery became `invalid_token`
- the device was disabled automatically
- cron job `chuong-push-dispatch` is active on a one-minute schedule
- temporary user/device/notification/delivery data was deleted afterward

Migrations:
- `202610030020_phase4fb_push_delivery.sql`
- `202610030021_phase4fb_push_cron_extensions.sql`
- `202610030022_phase4fb_push_worker_schedule.sql`
- `202610030023_phase4fb_push_token_validation_fix.sql`
- `202610030024_phase4fb_push_admin_monitoring.sql`

Edge Function:
- `push-dispatch` version 2

Docs:
- `docs/PUSH_NOTIFICATIONS.md`

Still required for real device delivery:
- link the app to an Expo/EAS project
- configure Android FCM v1 credentials
- configure Apple APNs credentials
- install a real Android/iOS preview or production build
- enable Push notification inside CHƯƠNG
- perform real-device push + deep-link QA

Next:
- Phase 4G: search and discovery upgrade:
  - full-text book/author search
  - accent-insensitive Vietnamese search
  - filters/sorting
  - search history
  - trending/hot ranking from real signals
  - personalized discovery groundwork
