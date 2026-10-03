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
