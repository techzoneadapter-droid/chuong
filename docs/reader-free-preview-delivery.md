# Reader Phase 3 + Free VIP Preview — delivery

## Branch and preservation

Work stays on `feature/reader-gestures-free-preview`. Existing Phase 3/3B work was checkpointed as `a183e86` on `backup/chuong-performance-phase3` and pushed. Remote preview commits were inspected before the checkpoint was cherry-picked as `db7f42b`; no reset, force push or main merge occurred.

Expo SDK/config/projectId, development client, artwork, native dependencies and Ads 16.3.4 remain unchanged. `npm ci --no-audit --no-fund` completed with the existing lockfile.

## Implementation

- Retains the Reader engine, bounded prepared-text LRU, pending request deduplication, fresh settled-read authorization, cooperative text/TTS work, sparse chapter order, position restoration and gesture settings from Phase 3/3B. Existing arrows remain. Gestures default off and use the same authorized navigation path.
- Adds canonical `books.free_preview_chapters`: integer 0..100000, default 0. Chapter **numbers** 1..N are preview; this is not a count of the first N published rows. Draft/private/hidden/rejected content remains protected. N+1 onward uses existing book/chapter entitlement and early-access policy.
- Author create and chapter management, mobile Content Studio metadata, admin web Upload Studio and catalog create/edit support presets 0/5/10/50 and custom limits. Reductions require confirmation before writes. Labels and chapter filters use the shared display policy; the database grants actual access.
- Prefetch includes eligible preview neighbors but never paid boundary chapters. Completed text cache never grants access. Book context is passed from existing book requests without per-chapter book queries.
- Preview downloads use the existing **7-day** bounded offline license, including when their display badge says FREE. Online server lock removes downloaded content. Fully disconnected devices cannot observe a newly reduced N immediately; existing license expiry remains the boundary. No payments, refunds, entitlement revocations or author-revenue transactions are added.
- Closes a historical table-level `SELECT` grant on chapter bodies. Safe metadata remains readable; author editing retains its existing secure RPC. Admin clients now use a role-checked body RPC. This avoids breaking editing while removing the raw body route.

The new admin RPC uses a fixed empty search path, qualified relations and restricted execute grants, consistent with [Supabase database function guidance](https://supabase.com/docs/guides/database/functions). Existing book ownership/admin RLS is preserved.

## Production migration — explicit approval required

**Not applied.** Forward SQL: [`20261010164000_book_free_preview_chapters.sql`](../supabase/migrations/20261010164000_book_free_preview_chapters.sql). It runs in one transaction:

1. Add the bounded integer field with default 0; old books keep their current access behavior.
2. Replace the private reading implementation and `can_read_chapter`, preserving reading RPC signature, moderation/publication/ownership guards and entitlement checks.
3. Revoke table-wide/body SELECT from anon/authenticated; grant only chapter metadata.
4. Add admin-only `get_admin_chapters_for_editing` and refresh PostgREST schema cache.

No content, user, purchase, wallet, revenue or entitlement rows are deleted or rewritten. Adding the column/constraint briefly locks `books`; schedule an appropriate maintenance window if this table is large. Clients using arbitrary raw chapter-body SELECT must migrate to the authorized RPC before deployment. The known mobile and admin-web callers are updated here.

Before applying, verify the target project and installed prerequisite migrations (including early access, restored Reader execute permissions and scheduled publishing); take a Supabase database backup with a verified restore path. Export the current function definitions and chapter grants for review:

```sql
select pg_get_functiondef('private.get_chapter_for_reading_impl(uuid,integer)'::regprocedure);
select pg_get_functiondef('private.can_read_chapter(uuid,uuid)'::regprocedure);
select grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='chapters';
select grantee,column_name,privilege_type from information_schema.column_privileges
where table_schema='public' and table_name='chapters';
select column_name from information_schema.columns
where table_schema='public' and table_name='books' and column_name='free_preview_chapters';
```

If the column already exists, export `select id,free_preview_chapters from public.books` to a private backup CSV before applying. Before any later rollback, export this CSV again to retain configured values. Keep backups outside the repository.

Emergency rollback SQL: [`20261010164000_free_preview.sql`](../supabase/rollback/20261010164000_free_preview.sql). It disables preview by setting N=0 and restores the prior early-access reading implementations. It retains the column, body privilege hardening and admin editing RPC, preserving purchases and editing. It intentionally does not restore the old raw body exposure. Restore individual N values from the private backup only after the forward policy is reinstated. PostgreSQL tests execute this rollback and verify paid access/raw-body denial/admin editing afterward.

Deploy order after approval: verify backup → apply reviewed migration transaction → verify production guest/reader/owner/admin boundaries → deploy tested feature admin artifact using existing GitHub Pages workflow → verify live controls. Do not deploy while the required migration is unapplied or validation gates fail. No main merge is needed for a workflow dispatch against the feature ref, subject to existing Pages environment protection.

Read-only checks on 2026-10-10: selecting the preview column with `limit=0` returned HTTP 400/code 42703 (column absent); selecting body with `limit=0` returned 200. No chapter body was retrieved. Existing [admin website](https://techzoneadapter-droid.github.io/chuong/) returned 200 and did not yet contain `catalogFreePreview`. These probes establish API/schema observations, not a successful production migration.

## Validation

- PASS: final TypeScript; UI copy audit; admin JS syntax.
- PASS: existing database/economy/followed updates/release batching/author release suites.
- PASS: performance Phase 1/2 helpers; Reader Phase 3 text/TTS/dedup/LRU/authorization helpers; gesture direction, edge exclusion, multi-touch, long press, release and cleanup helpers.
- PASS: actual PostgreSQL preview migration for guest/reader/owner/admin, N=0/5/10/50/custom, N/N+1, book/chapter VIP, publication/moderation/private guards, raw SELECT denial, author/admin editing, unauthorized updates, bounds and retained purchases; emergency rollback.
- PASS: browser admin create/edit/preset/custom validation and cancelled reduction against an isolated mock API. No live writes.
- PASS: final Expo production export web/Android/iOS at `.cache/reader-preview-final`. Web main ~2.99 MB; Android/iOS Hermes ~5.60 MB each. This establishes bundling compatibility, not native build or device performance. QA export uses explicit localhost mock configuration; after changing EXPO_PUBLIC variables, a clean Metro cache was required to avoid stale transforms. It is not a production upload artifact.
- **Existing release gate fails** at `App name is CHƯƠNG`: tracked `app.json` contains the corrupted display name `CHÆ¯Æ NG`. Config is preserved as requested; no native/config change was silently made. The audit reader now accepts the existing UTF-8 BOM, handles Windows file URLs correctly and verifies the installed Ads 16.3.4 pin instead of the obsolete 16.5.0 expectation. The name failure remains a production deployment blocker. A one-line proposed fix is included in `expo-name-encoding.patch` for review; it changes only the display name, preserving projectId and Live Preview settings.
- PASS: final Reader release-web browser suite **18/18**, including 100/500/1201 chapter catalogs, 2000 paragraphs, rapid swipes, locks, offline, font/page changes, TTS and restored pixels. A production-web horizontal swipe cancellation found during QA was fixed: the non-passive listener now prevents browser panning only for a direction-locked recognized chapter swipe/pull, preserving ordinary scrolling, edges and selection. Android/iOS native handler behavior is unchanged.
- PASS: final backend/discovery release-web browser suite **21/21**, covering author autosave/editing, login/logout/progress, wallet/paywall/currency unlocks/gifts, follows, notifications, author hub/catalog and discovery virtualization. One creator-pagination assertion failed during an earlier concurrent run, then passed alone and in the final full run; retain it as a timing sensitivity to watch, not a claimed product regression fix.
- A local diagnostic of the release audit with only the display-name assertion downgraded passed the remaining 699 checks. This is diagnostic evidence only; the real `npm run test:release` remains failing until the reviewed name fix is approved/applied and the real gate rerun.

Measured Node text/TTS fixture: 5,188,888 characters, 20,000 identical segments; latest run synchronous 407 ms versus cooperative 950 ms wall time, 65 heartbeat callbacks, maximum heartbeat gap 19 ms. These are host fixtures, not Samsung/iOS performance. Earlier Phase 3 measurements remain in `performance-phase3-reader.md`; no native before/after FPS, heap or startup improvement is claimed.

Final release-web fixture observations (one sample each, mock network, no directly comparable native baseline):

| Chapters | Open ms | Next ms | Metadata requests | Body requests |
|---|---:|---:|---:|---|
| 100 | 794 | 150 | 1 | 1,4,1 |
| 500 | 690 | 95 | 2 | 1,4,1 |
| 1201 | 970 | 167 | 3 | 1,4,1 |

The 526,888-character/2,000-paragraph fixture reached ready/restored state in 2,537 ms. Host/browser timings vary under parallel workload; they do not prove native latency improvement. Page-size 500 explains the bounded metadata requests; no whole-story body preload occurred.

## Files changed by this integration

`admin-web/{app.js,catalog-admin.js,index.html,free-preview.js}`;
`app/(tabs)/library.tsx`; `app/author/books/new.tsx`; `app/author/books/[bookId]/chapters/index.tsx`;
`app/book/[id].tsx`; `app/book/[id]/chapters.tsx`; `app/reader/[bookId].tsx`; `app/studio/book/[bookId].tsx`;
`components/{ChapterRow.tsx,FreePreviewField.tsx}`; `lib/freeChapterPreview.ts`; `hooks/useReaderGestures.ts`;
`services/{adminCatalog.ts,authors.ts,books.ts,chapters.ts,downloadManager.ts,offlineDownloads.ts}`;
`types/{database.ts,index.ts}`; forward and rollback SQL above;
`tests/{free-preview-policy.mjs,free-preview-db.mjs,performance-phase2.mjs,performance-phase3-reader.mjs,reader-gestures.mjs,release.mjs}`;
`tests/web/{admin-free-preview.spec.ts,reader-performance.spec.ts}`; `package.json`; `.github/workflows/ci.yml`; this report, `expo-name-encoding.patch` and the Phase 3 Reader report addendum.

The integration commit can be located with `git log -1 --oneline` on the feature branch. Commit/push does not apply the SQL or publish Pages. All changed/untracked files were scanned for private-key, secret Supabase, GitHub token and AWS access-key patterns before staging; no matching secret material was found. Public publishable keys already in the app are intentional.

Metro status at final verification: no listening process on 3000/3001/3002/8081/8082. Temporary QA static servers are stopped after tests; no user Metro process was restarted or terminated. To start Samsung testing after migration, use the existing development client with `npx expo start --dev-client --host lan --port 8081 --clear`; preserve the project's normal real backend environment, not the localhost QA export variables. The current tool environment has no Supabase CLI/SQL connector or database credentials; applying the approved production migration also requires an authorized database session (for example the project's Supabase SQL Editor).

## Samsung Android 9 and admin verification after migration

1. Use the feature branch in the existing Development Build. Fast Refresh/reload covers JS changes; no new native module was added. Verify the device connects to the correct Metro project. No user Metro process was terminated.
2. As author create/edit an approved public VIP book, set N=5, then 10/50/custom. Confirm the saved limit survives reopening. Try -1/decimal/100001; none should save. Cancel a reduction and verify the old value remains.
3. As guest and regular reader, open N and N+1. N shows FREE/content; N+1 uses the original paywall. Repeat chapter-level VIP, N=0 and an already purchased book. Verify private/draft/hidden chapters stay unavailable to guests.
4. Enable horizontal/boundary chapter gestures in reading settings. Test left/right, outward top/bottom pull, rapid repeats, first/last chapter, diagonal/normal scroll, text selection, OS back edges, arrows, font/size changes, restored pixel position, bookmarks and TTS during manual/automatic transitions.
5. Test 100/500/1201+ chapter books, sparse numbering and a very long chapter. Download authorized preview/paid chapters, disconnect, restore reading, reconnect after reducing N and verify server lock/expired license handling. Existing purchases should remain valid.
6. On the deployed admin URL, verify both Upload Studio and catalog create/edit controls, FREE badges, reduction confirmation, chapter editing via RPC and persistence back to mobile. A non-admin session must not enter admin or mutate someone else's limit.
7. Repeat Android/iOS native release tests on low/mid/high devices; measure cold opens and transitions p50/p95, JS/UI frame drops and settled/peak memory with comparable datasets/networks. Browser/timing fixtures do not validate native system gestures, TalkBack/VoiceOver or Samsung Android 9 runtime behavior.
