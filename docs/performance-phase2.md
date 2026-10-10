# CHUONG Phase 2 performance audit

Date: 2026-10-10 (Asia/Saigon). Branch: `backup/chuong-performance-phase1`.
Baseline: `137f3a38b124586142d8f586eb090393ae57de92`.

Phase 1 improvements were retained. This phase changes application code and tests only. Expo Live Preview configuration, dependencies/lockfile, artwork, database/schema, VIP entitlement RPCs, currencies, revenue, payments and ad service logic remain unchanged. No remote data was modified, no native libraries upgraded, and no commit/push/deployment was performed.

## Findings and implementation groups

1. Offline payload and manifest operations previously overlapped during four parallel downloads, access timestamp writes and removal. All manifest mutations now use a serial queue, including payload access, so concurrent downloads cannot replace each other's records. Native chapter payload writes now await `expo-file-system/legacy.writeAsStringAsync`, already included in SDK 54, rather than synchronous `File.write`. File names, UTF-8 JSON format, checksum, quota and license rules remain the same. The queue is in-process; filesystem/AsyncStorage cannot provide a cross-process transaction.
2. Library previously fetched the entire public catalog and one progress request/cache parse per entry. It now requests only library IDs in batches of 100, at most two book batches and three metadata loads at once. Progress is read in batches of 100 and written to cache once. Metadata is still fetched to preserve exact chapter totals and sparse-number progress calculations, but only the total and ordinal remain in the screen state. Loads invalidated by blur/account changes no longer update screen state.
3. Library, Discover, full recommendations, Downloads, author Studio and Creator catalogs now use FlatList. Existing row markup, covers, ornamentation, controls, padding and spacing are retained. Library/Discover rows are memoized. Creator rows preserve the responsive 146px card grid and 12px spacing. No fixed height assumptions were introduced because font scaling can alter rows. Clipping stays disabled for shadows. Updates and chapter list screens already use virtualization and were retained.
4. Discover now loads subsequent search/filter pages through the existing offset RPC. Pending identical public requests share a promise; completed requests are immediately eligible for fresh fetching. Rankings keep the existing 50-result RPC ceiling: first 40 and then the remaining 10. Request generations prevent obsolete pages being appended after filters change. Search waits for the debounced query when typing changes the sort, avoiding an intermediate empty-query request. Pagination adds no new control or label.
5. Reader previously initialized voice discovery, TTS segmentation and preference reads even when audio was never used. Audio mounts on the first use and stays mounted afterward to preserve playback when its sheet closes. Joined audio text is memoized; paged content is computed only in page mode. Metadata requests share only pending promises within the same reader/account/retry generation; chapter bodies and entitlement checks are never cached or prefetched. Progress/bookmark reads run in parallel. Delayed scroll restoration and TTS restarts are cancelled when obsolete. Auto-scroll avoids background updates; analytics periodic requests pause when unfocused/backgrounded while existing transition/final flushes and active-time counters remain intact.
6. Home and Library wait for persisted auth restoration before issuing account-dependent loads. Profile loading no longer repeats solely because a refreshed session replaces an otherwise unchanged user object; account and user-update changes still refresh. Push response navigation remains immediate after its module loads in an effect; permission-aware device registration waits for idle time with a one-second bound and cannot overlap. Ads initialization and consent behavior were not altered.
7. Added opt-in development diagnostics for React render durations and JS timer lag. It uses a stable development Profiler wrapper so enabling measurement does not remount navigation/auth. No samples or timer run before `start()`; release builds render children directly. The bounded buffer holds at most 600 samples. No network or persistent storage is used for diagnostics.

## Evidence: measured versus expected

| Workload | Phase 1 baseline | Phase 2 evidence |
| --- | --- | --- |
| Library progress for 205 books | 205 individual progress queries | Fixture test: 3 queries, 2 cache reads, 1 cache write |
| 500-entry Library render | All 500 mapped rows | Browser stress: 5 missing-book rows initially mounted; scrolling retains a bounded window |
| Four concurrent offline saves | Unsynchronized read/modify/write | Fixture test: all 4 records retained; simultaneous access/delete plus download also retain correct records |
| Native payload persistence | Synchronous file write | Native adapter test verifies asynchronous UTF-8 write and round-trip/checksum |
| TTS before opening audio | Voice discovery and segmentation run | Browser instrumentation: 0 voice lookups before opening audio; lookups start when opened |
| Search pagination | Only first 40 results rendered | 105-book mock test requests offsets 0, 40 and 80; final page and bounded mounting verified |
| Reader metadata while rapidly switching | Separate overlapping catalog requests | Single-flight implementation and helper regression tests; no retained metadata/body cache |

A development browser diagnostics smoke recorded 7 render samples (p50 about 0.7ms, p95 about 35.2ms, max about 55.7ms) and 2 JS lag samples (max about 70.8ms). This is a tiny, instrumented web sample during audio activation, not an Android/iOS benchmark or a before/after performance improvement. Workload count reductions and storage correctness above are measured fixtures. Lower startup latency, smoother device scrolling and lower native memory are expected impacts that still require physical-device measurement. Metro bundling durations are build timings, not app startup metrics.

## Validation

- `npm run typecheck`: final check passed with test servers stopped to avoid competing generated router declaration writes.
- `node tests/performance.mjs`: Phase 1 regression tests passed.
- `node tests/performance-phase2.mjs`: passed storage concurrency, native async payload format, VIP expiry/checksum, bounded concurrency, batched progress, request deduplication/fresh refetch and ranking/search offsets.
- `npm run test:db`: all five suites passed, covering RLS, economy/VIP, followed updates, release batching and author releases.
- `npm run test:ui-copy` and `npm run test:admin-web`: passed.
- Demo Playwright run: 7 passed, 20 backend tests deliberately skipped on the demo server. Existing route smoke, artwork at mobile/desktop widths, reader page/scroll/TTS settings and progress/bookmark persistence passed.
- Separate localhost backend mock run: all 20 existing tests passed, including sparse chapter navigation, account restoration/logout, author editors/autosave, wallet, both unlock currencies, gifts, notifications and creator pagination at 390px/1280px.
- Additional 105-book pagination test: passed; exactly three search requests (offsets 0, 40, 80), final book visible, fewer than 50 rows mounted, no page errors. The test scrolls the actual vertical list rather than sending wheel events over the horizontal filter controls.
- Android/iOS Hermes exports passed after the final changes (Android 5.56MB, iOS 5.57MB). Final production web export passed (main bundle 2.96MB). These verify bundling, not Gradle/Xcode compilation, native ads/IAP runtime or device memory.
- `npm run test:release` remains blocked by the baseline BOM in `app.json`; the existing direct JSON.parse fails before assertions. The baseline AdMob dependency is 16.3.4 while that test expects 16.5.0. The configuration and libraries were preserved as requested.

## Samsung Android 9 / iOS verification

SDK 54's documented baseline is Android 7+ and iOS 15.1+, so Android 9 is within the SDK range. No minimum OS, architecture, native plugin or Live Preview setting changed. The asynchronous file API is provided for Android and iOS in SDK 54. This does not substitute for testing the existing third-party native SDKs in the actual build. This workspace has no adb/device connection and no Xcode host; native UI-thread FPS, native heap and cold startup timing were unavailable.

Reload the existing Samsung Live Preview after applying the local files. In the React Native DevTools console, after the app has mounted:

```js
globalThis.__CHUONG_PERF__.start()
// Run the same tab, scrolling, reader and audio sequence for about 30 seconds.
globalThis.__CHUONG_PERF__.stop()
JSON.stringify(globalThis.__CHUONG_PERF__.report(), null, 2)
```

Use `clear()` to discard samples between runs. For JS/render regression checks, compare identical device, app mode, account, dataset and network conditions. The API is intentionally available only in development; React profiling adds measurement overhead. It reports JS lag, not UI FPS. Use RN's performance monitor and Android Studio/Perfetto for UI frames, and Android Studio memory profiler for heap. On iOS use Instruments Time Profiler, Animation Hitches and Allocations. Repeat on release builds because Live Preview/Metro/devtools overhead is materially different. Do not change Live Preview settings to conduct the comparison.

Suggested acceptance sequence: 10 cold starts and 10 warm starts; 20 tab transitions; 500-book library; 105-result filtered search; 5,000 chapter metadata rows; long chapter with page/scroll mode, progress restore, quote sharing and TTS; four concurrent downloads followed by reading/removing a different download; network loss/reconnect, background/resume and account switching. Keep free/VIP and both currencies in the existing sandbox test flows. Record p50/p95/max navigation, JS lag, UI dropped frames and peak/settled memory on low-end, mid-range and flagship Android plus older/current iPhone.

## Remaining bottlenecks and next steps

- Long chapter bodies still use ScrollView. Replacing this with paragraph virtualization without native measurements risks changing pixel-offset restoration, selection, auto-scroll and total-progress behavior. The current change removes unused TTS/page work, but does not bound all native paragraph views.
- Library metadata remains one paged catalog load per public library book to preserve exact sparse-chapter progress. Three-way concurrency limits bursts; a server-side ordinal/count endpoint would reduce bytes further but would require separately authorized API/schema work.
- Offline JSON parsing/checksum generation and the manifest remain proportional to stored chapter count. File writes are asynchronous and updates safe, but a very large manifest still needs device profiling before adding a persistence cache/index.
- Artwork, original cover URLs, native decode handling and platform image cache from Phase 1 are unchanged. Server thumbnail transforms and aggressive image compression were not introduced.
- IAP/AdMob consent and initialization remain existing behavior; assess their native startup costs on a real release build before proposing timing changes.
- Admin/studio editor tables and remaining bounded sections need realistic author datasets to decide whether further restructuring is beneficial. Existing typography and all author controls are retained.

## Files changed

Application lists/navigation: `app/(tabs)/index.tsx`, `app/(tabs)/library.tsx`, `app/(tabs)/discover.tsx`, `app/(tabs)/write.tsx`, `app/recommendations.tsx`, `app/downloads.tsx`, `app/creator/[id].tsx`, `app/reader/[bookId].tsx`, `app/_layout.tsx`.

Startup/background: `components/PushNotificationBridge.tsx`, `components/PerformanceDiagnostics.tsx` (new), `contexts/AuthContext.tsx`, `hooks/useReadingAnalytics.ts`, `hooks/useTtsPlayer.ts`, `lib/scheduleIdle.ts` (new).

Data/storage: `services/library.ts`, `services/discovery.ts`, `services/offlineDownloads.ts`, `lib/asyncWork.ts`.

Tests/report: `tests/performance-phase2.mjs` (new), `tests/web/performance-phase2.spec.ts` (new), `tests/web/performance-backend-phase2.spec.ts` (new), `docs/performance-phase2.md` (new).

References: [RN performance](https://reactnative.dev/docs/performance), [FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration), [Expo SDK OS table](https://docs.expo.dev/versions/latest/), [SDK 54 async file API](https://docs.expo.dev/versions/v54.0.0/sdk/filesystem-legacy/), [development/production modes](https://docs.expo.dev/workflow/development-mode/).
