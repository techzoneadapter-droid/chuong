# CHUONG — Phase 3 Reader performance engine

Date: 2026-10-10. Baseline: `ef6cd90bb45b1513d3ad931cfa08fa44d09e9acc` (Phase 2).
Working branch at the start: `backup/chuong-performance-phase2`. Changes remain local; no commit, push or deployment.

## Audit before changes

The Home card opens Book Detail; its loader waits for book hydration, the complete published **metadata** catalog, then library/progress/follows/recommendations/offline records/gifts. The recommendation request still retrieves the public book catalog. Reader repeats book hydration and chapter metadata before loading progress/bookmarks and the selected chapter. Book Detail was audited but not restructured in this phase: changing recommendation semantics or author/economy flows was outside the demonstrated Reader bottleneck.

`getChaptersByBook` already selects metadata without `content`, in pages of 500. Reader already requests one actual chapter body through `get_chapter_for_reading`; it does not download all bodies. The problem was repeating metadata on every chapter transition. Pending-only Phase 2 deduplication did not help sequential navigation. Book state holds the current body, not accumulated chapter bodies.

Before changes, an isolated localhost backend fixture with sparse chapter numbers (1, 4, 7, …) measured:

| Catalog size | Metadata requests for open → next → previous | First opening, dev web | Next transition, dev web |
| --- | ---: | ---: | ---: |
| 100 chapters | 3 | 13,179ms | 293ms |
| 500 chapters | 6 | 1,443ms | 248ms |
| 1,201 chapters | 9 | 1,682ms | 251ms |

The first opening includes cold Metro compilation. These are single Playwright observations with mocked responses, not network/device benchmarks or statistically valid startup percentiles. Counts are reproducible workload evidence; opening times are not comparable cold versus warm.

On this machine, the original synchronous TTS preparation took about 42ms for 516,888 characters/2,000 paragraphs, and 637ms for 5,188,888 characters/20,000 paragraphs. Plain paragraph splitting took about 0.8ms and 7.2ms respectively. TTS preparation was therefore a demonstrated JS task worth splitting. Paragraph creation was already memoized in Phase 1 and voice initialization deferred in Phase 2; those changes were retained rather than reimplemented.

Loading returns a separate loading tree, unmounting AudioSheet. Its local automatic-next flag was lost on that unmount. A fixed 80ms scroll-restore timer also assumed that native text layout had finished. Both were examined against explicit transition/layout tests.

## Controlled changes

1. **Reader session metadata.** One book/account/retry instance shares pending catalog and chapter requests. Successful online metadata is reused for 30 seconds, then revalidated on demand. Book/account change, retry/unlock reload or Reader unmount releases the old instance. Offline metadata is not retained as an online cache, allowing reconnect to load fresh catalogs. The catalog contains no chapter bodies. Canonical book IDs remain in RPC arguments even when entering through a slug.
2. **Bounded text LRU.** At most three prepared chapter entries and a conservative 2MiB estimated retention budget. Weight estimates UTF-16 body/paragraph strings and paragraph overhead; it is not native heap accounting. Oversized chapters are displayed in full but not retained. Exact returned text must match before paragraph arrays are reused. Errors/null results invalidate the prepared entry. The active chapter, TTS buffers, transient requests and native text views are outside that cache budget.
3. **Authorization-safe prefetch.** After a 500ms delay and idle scheduling, at most the actual next and previous free chapters are prepared, one speculative request at a time. VIP books, configured VIP chapters, offline/background states and cancelled transitions are excluded. Focus cleanup stops scheduling when Reader is no longer focused. Only pending RPC work is shared with navigation. After prefetch has completed, navigation calls the existing reading RPC again; completed cached text never supplies access rights or bypasses server revocation. Consequently this cache reduces repeated parsing, not the full-body bytes of a settled subsequent RPC. Prefetch is not an offline download and does not extend VIP licenses independently of the existing chapter service behavior.
4. **Cooperative text/TTS preparation.** Paragraph splitting can yield between batches. TTS normalizes text in 32KiB chunks and processes sentence/word segments in cooperative batches. Its output matches the synchronous implementation, including CR/LF and whitespace at chunk boundaries. Cancellation stops obsolete preparation and stale playback. No Worker/native library was added. A huge single sentence/word, string joining, regex scans, allocations and garbage collection can still exceed a frame; this is not a guaranteed 4ms scheduler.
5. **Transition and progress safety.** Existing active-request guards discard delayed old responses. Metadata index lookup is memoized, avoiding two full scans per progress update. Nearby chapter selection uses ordinal indexes rather than chapter numbers, preserving sparse order. Selecting the current chapter simply closes the sheet. Progress/analytics readiness is tied to the loaded route and account engine, preventing an old chapter snapshot from being associated with a new route/account. Existing serialized progress flush, bookmark persistence and analytics semantics remain intact.
6. **TTS continuity.** Resume intent lives in Reader across loading, and playback waits for prepared text/voices in the new authorized chapter. Manual chapter navigation stops old playback. Locked/failed loads and account/book/retry changes clear resume intent. Sleep-at-end and automatic-next preferences remain existing logic; no payment or unlock operation is initiated by audio/prefetch.
7. **Layout and offline.** Saved pixel position is restored from content-size layout callbacks rather than a timer. Page-mode progress restoration remains existing behavior. With explicitly disconnected connectivity (`connected === false`), Reader uses offline metadata and the chapter service validates the existing local checksum/license directly, avoiding doomed RPC retries. Connected or unknown networks still use server authority, even when internet reachability is reported negative/uncertain, followed by the existing network-failure fallback. Offline persistence format, quota, expiration, checksum, revoke/delete behavior and Phase 2 serial queue are retained.
8. **Opt-in measurements.** `__CHUONG_READER_PERF__` records catalog, chapter-and-text, open-to-ready, ready-to-layout and TTS preparation durations in development. It stores at most 200 duration samples, with no content/account IDs, timers, network or persistence. Layout callback timing is not native UI-frame time. Release has no exposed diagnostic API.

## Evidence after changes

Metadata requests for the same open → next → previous sequence are now **1, 2 and 3**, respectively: a measured 66.7% reduction in catalog query count during the 30-second reuse window. All metadata requests explicitly exclude body content. Sequential settled body requests still validate chapters 1, 4, 1. Pending sharing, exact text hits, LRU eviction, oversized bypass, TTL expiry and disposal are covered independently.

An early warm dev-web comparison observed next transitions of 186/137/140ms versus baseline 293/248/251ms. Another run observed 170/143/138ms. These small samples support the expected latency benefit but do not establish a device speedup. Opening times varied and did not consistently improve; no startup reduction is claimed.

A cooperative TTS fixture produced **identical 20,000 segments** for 5,188,888 characters. An initial run measured synchronous 611ms versus cooperative 1,232ms wall time, with 74 other JS heartbeat callbacks and a maximum observed heartbeat gap of 55ms. Under concurrent validation, results varied (for example 1,608ms synchronous, 2,641ms cooperative, 76 heartbeats, 112ms maximum gap). Cooperative scheduling trades total completion time for responsiveness; it does not eliminate all stalls and is not a native UI FPS measurement.

A 526,888-character/2,000-paragraph browser chapter mounted all 2,000 paragraphs, restored a saved 420px offset, preserved all text after font/size changes and reduced mounted paragraph views only when the user selected the existing page mode. One run reached loaded/restored state in 3,288ms, including browser route startup. This is functional coverage, not an Android memory or rendering improvement claim. Scroll mode intentionally still mounts the complete chapter.

The bounded-prefetch test warms chapter 4, then changes the server response to locked. Navigation issues a fresh RPC and displays the existing paywall without showing cached content. The actual chapter-service test also verifies download invalidation on server lock and offline license expiry. A delayed chapter-4 response cannot replace chapter 7 after another route change. TTS continues chapter 4 after loading, and does not speak locked chapter 7. Offline fixtures read chapters 1 and 4 without content RPCs.

## Validation

- TypeScript passed after all functional changes.
- Phase 1/2 helper suites and `node tests/performance-phase3-reader.mjs` passed. Phase 3 covers exact paragraph/TTS parity, chunk boundaries, cancellation, TTL, LRU/estimated-byte limits, pending deduplication, fresh permission checks, actual chapter-service lock/download invalidation and offline license expiry.
- `npm run test:db`: all five database/economy/update/release/author suites passed. `test:ui-copy` and `test:admin-web` passed. Existing unlock cases preserve both Spirit Stone currencies.
- Combined backend/Reader browser run: 28 passed, two timed out at the five-second assertion default (unchanged Creator pagination and offline initial opening). Creator passed on isolated retry. Offline passed with a 15-second initial rendering allowance and an explicit assertion of **zero attempted content RPCs**.
- Focus-aware Reader follow-up: all nine Reader cases passed across the targeted run and final same-chapter selector correction. The corrected selector clicks the actual chapter row inside the dialog and verifies the dialog closes; the earlier selector targeted the title behind the modal. Other cases cover 100/500/1,201 chapters, long text, sparse/repeated navigation, slow-response races, offline, font/size/page mode, active TTS transition and later lock. The 105-book Phase 2 pagination regression also passed. Timing/selector failures are recorded rather than interpreted as device performance.
- Demo/artwork/Phase 2 UI regressions: seven cases passed. Final-source production web and Android/iOS Hermes exports passed after the pixel-persistence correction: main web bundle 2.97MB, each native bundle 5.58MB, 113 original exported assets. Output: `.cache/performance-phase3-release`. These sizes are artifacts, not measured reductions.

Native Android/iOS Hermes and production web exports validate bundling only; they do not substitute for Gradle/Xcode builds, native Speech callbacks, ads/IAP or real device profiling. The existing release test's BOM parsing failure in `app.json` and its baseline AdMob 16.5.0 expectation versus installed 16.3.4 are outside these changes. Config/dependencies are preserved.

## Development versus release and physical devices

There is no connected adb device or iOS/Xcode host in this workspace. Native UI-thread FPS, peak/settled RAM, thermal/power behavior, real Supabase latency, Samsung Android 9 cold/warm starts and iPhone timing were **not measured**. Expected benefits are fewer catalog requests/allocations, bounded retained processed text and more responsive JS during TTS preparation. Existing SDK 54 OS/native configuration, Expo Live Preview, artwork, schema, currencies, VIP, ads, IAP, payments and author revenue were not changed.

After Reader has loaded once on Samsung Live Preview, enable diagnostics in the RN DevTools console:

```js
globalThis.__CHUONG_READER_PERF__.start()
globalThis.__CHUONG_PERF__.start() // Existing Phase 2 React render / JS-lag diagnostics
// Repeat the same opening, next/previous, scrolling and audio sequence.
globalThis.__CHUONG_READER_PERF__.stop()
globalThis.__CHUONG_PERF__.stop()
JSON.stringify(globalThis.__CHUONG_READER_PERF__.report(), null, 2)
JSON.stringify(globalThis.__CHUONG_PERF__.report(), null, 2)
```

`chapter-and-text` includes permission RPC, existing offline refresh and text preparation. `open-to-ready` starts with the Reader effect and excludes Home/Book Detail navigation and initial module loading. `ready-to-layout` ends at a content-size callback, not GPU presentation. Dev rendering/profiling and Metro add overhead; repeat native release measurements with Android Studio/Perfetto and iOS Instruments rather than treating these development samples as release performance.

Use identical device/account/dataset/network and compare 10 cold opens, 20 chapter transitions, chapters with sparse numbers, 100/500/1,201 metadata entries, long scroll/page chapters, font changes at a saved offset, TTS manual/automatic/sleep transitions, download/offline/reconnect, account changes and entitlement revocation. Record p50/p95/max for request and transition time, JS lag, native dropped frames, peak and settled heap on low/mid/high Android and older/current iPhones.

## Remaining risks and next work

- ScrollView still mounts all paragraphs. Very long chapters can create many native text views and large TTS/active buffers, regardless of the LRU limit. Native profiling is needed before paragraph virtualization, because it affects text selection, quote sharing, pixel restoration, auto-scroll and whole-chapter progress.
- Metadata can be up to 30 seconds stale within a Reader session. Fresh chapter RPCs still reject deleted/locked content. An explicit requested chapter absent from the catalog triggers revalidation; other new chapters appear after TTL expiry, retry/re-entry or unlock reload. No stale metadata grants access.
- Prefetch adds up to two speculative free-body requests and does not reuse settled authorization results. It may offer limited benefit on network-bound devices; measure transferred bytes and user navigation patterns before expanding it.
- Foreground native requests already started before cancellation cannot all be aborted; stale completions are ignored and disposed caches do not retain them. Temporary active/in-flight text and GC are not covered by the cache's estimated retention budget.
- Full offline JSON parsing/checksum and existing refresh of downloaded chapters remain on the critical path; Phase 2 async writes/serial ordering were retained for correctness. Explicit disconnect gets a fast local path, while a server outage with connectivity reported online retains existing request timeout/fallback behavior.
- The Book Detail prerequisite catalog/recommendation load remains a separate opening bottleneck. A future incremental recommendation query must preserve current ordering/selection and be measured with realistic books before changing it.
- TTS parity is tested for realistic sentences and large fixtures; very large single unbroken words/sentences and platform-specific Speech stop/end events still need native validation.

## Phase 3 files

- `app/reader/[bookId].tsx`: session engine, prefetch scheduling, route-ready checks, layout restore, sparse indexes, TTS resume and timing hooks.
- `lib/readerEngine.ts` (new): metadata TTL/pending deduplication and weighted prepared-text LRU.
- `lib/readerPerformance.ts` (new): opt-in Reader duration diagnostics.
- `services/chapters.ts`: explicit offline fast path through existing license/checksum validation.
- `services/tts.ts`: cooperative text normalization and TTS segmentation; synchronous API retained.
- `hooks/useTtsPlayer.ts`: cancellable asynchronous preparation and readiness.
- `hooks/useReadingProgressSync.ts`: live pixel capture at flush time without per-scroll renders.
- `tests/performance-phase3-reader.mjs` (new): text/TTS parity, cache bounds, TTL, permission/offline and scheduling fixtures.
- `tests/web/reader-performance.spec.ts` (new): Reader browser regression/stress fixtures.
- `docs/performance-phase3-reader.md` (new): this report.

Previously untracked Phase 2 helpers/diagnostics/tests were present at the beginning and remain untouched. No files were staged or committed.

## Final audit additions

- Explicit navigation to a newly published chapter absent from the cached catalog forces metadata revalidation before choosing a chapter. The browser fixture publishes chapter 4,000 after opening a 100-chapter catalog and verifies the requested body appears. Ordinary navigation retains the 30-second metadata TTL.
- The reading RPC was inspected in `supabase/migrations/202610050004_early_access_chapters.sql` and its public wrapper in `202610030006_phase4b_entitlements_unlocks.sql`: these stable functions select content and validate access; they do not unlock chapters, spend currency or write author revenue. No SQL was changed.
- A new regression reproduced stale pixel persistence: scrolling 420px in a 2,000-paragraph chapter left stored position at zero when rounded reading percentage did not change. `hooks/useReadingProgressSync.ts` now captures live pixels synchronously at flush time, before the serialized write queue. The four-second cadence and existing lifecycle flushes remain unchanged, without per-pixel React updates. The regression failed before the fix and passed after it; the existing saved-offset/font/page test also passed. There are eleven Reader browser cases in total, validated across targeted runs.
- Browser TTS coverage verifies both manual and utterance-end automatic transitions, followed by a locked chapter. Demo/artwork/Phase 2 UI regressions passed all seven cases.

References: [RN performance and development overhead](https://reactnative.dev/docs/performance), [RN threading model](https://reactnative.dev/architecture/threading-model), [Expo SDK 54 Metro](https://docs.expo.dev/versions/v54.0.0/config/metro/).
