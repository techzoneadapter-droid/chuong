# CHUONG performance audit ? 2026-10-10

Expo SDK 54 / React Native 0.81.5. Changes are local; no commit, push, schema migration, or backend deployment was performed. Existing changes in app.json, package.json, package-lock.json and expo-env.d.ts were present before this work and were preserved.

## Implemented

| Area | Finding and change |
| --- | --- |
| Home startup/navigation | Mount effect plus focus-triggered reload could duplicate initial loading. One focus-bound loader now refreshes once per focus/retry/account change and ignores late results after blur. The hero fetches one latest public book plus the saved book by ID when needed, instead of downloading the entire catalog. Other getBooks() callers retain full catalog behavior and 500-row paging. |
| Home rendering | Four ranking rails and recommendations now use horizontal FlatList, stable book IDs, initial/batch sizes of three and a small window. Different orientation from the parent vertical ScrollView avoids same-direction list nesting. Clipping is disabled to preserve decorative shadows. BookCard uses React.memo. |
| Supabase | The four existing ranking RPCs remain unchanged. Their unique book IDs are hydrated together once; scores, rank positions, order and missing-book handling are preserved. Author and genre hydration uses maps rather than repeated scans. No persistent request cache was added to entitlement or personalized data. |
| Images | Remote covers use Android decode resizing and the default platform HTTP cache. URLs and full-size book detail behavior remain unchanged. This is decode downsampling, not a new server thumbnail service; network bytes still depend on the original image and HTTP headers. |
| Reader/large chapters | Paragraph elements and long-press handlers are reused across progress/control renders. Quote sharing, scroll offsets, page mode, speech, ads and unlock paths remain intact. A guard prevents applying an obsolete load after awaiting reading progress. Chapter metadata already excludes bodies and pages in batches of 500. |
| Background/offline | Foreground bridge skips inactive/background polling, handles errors and avoids overlapping triggers. Same-account pending flushes share one promise. Storage mutations are serialized; flush snapshots are reconciled against current data, preserving newer progress and other accounts. Network I/O runs outside the storage lock. Retry/backoff and queue limits remain unchanged. |

## Before/after evidence

These are source-level workload counts and regression-test results, not device FPS or timing measurements.

| Workload | Before | After |
| --- | --- | --- |
| Hero catalog rows, online | Entire public catalog N | 1 latest row, plus at most 1 saved book |
| Four nonempty home ranking groups | 4 RPCs + 12 hydration queries = 16 | 4 RPCs + 3 shared hydration queries = 7 |
| Ranking/recommendation rail initial render budget | Up to 42 cards via map | Up to 15 initial cards via five lists; actual mounted count varies with windowing and viewport |
| Hydration CPU work for B books, A authors, G genre rows | O(B * (A + G)) | O(B + A + G) |
| Concurrent same-account queue flushes | Could repeat requests and overwrite queue data | One pending flush; new writes survive reconciliation |
| Reader paragraph element construction per progress update | O(number of paragraphs) | Reuses memoized elements when content and typography are unchanged |

## Validation

- `npm run typecheck`: passed after all functional changes.
- `node tests/performance.mjs`: passed deduplication, retry after rejection, account separation, storage serialization, writes during flush, replacement of progress during flush, ranking hydration/order/scores/missing books.
- `npm run test:db`: all five suites passed, including database/RLS, economy/VIP, followed updates, release batching and author releases.
- `npm run test:ui-copy` and `npm run test:admin-web`: passed.
- `npm run build`: production web export passed.
- `npx expo export --platform android --platform ios --output-dir .cache/performance-native`: both Hermes bundles passed. This checks native module resolution and JS bundling, not a Gradle/Xcode build or device runtime.
- `npm run test:release`: blocked by a pre-existing UTF-8 BOM in the already-modified app.json. The release test uses JSON.parse directly. The existing dependency version also differs from the test's pinned AdMob expectation; no dependency/config changes were made to hide these findings.
- Playwright demo suite: progress/bookmark persistence, reader settings/TTS and Vietnamese labels passed. The 20-route smoke test exceeded its shared 30-second budget during the first dev run; rerun passed in 23.3 seconds with no runtime errors or overflow. Artwork checks passed on 390px and 1280px viewports across Home, detail, library and reader (all images loaded; no overflow/runtime errors).

## Remaining measurement and follow-up work

Root startup still waits for the icon font; tab screens are lazy through the existing navigator defaults. Large reader bodies still use ScrollView to preserve pixel-offset restoration, auto-scroll, quote selection and speech behavior. Full paragraph virtualization requires native testing of those interactions before adoption. Discovery already debounces search and uses a bounded 40-result request; its UI exposes no complete paginated browsing flow. Its ranking RPC caps results at 50, so arbitrary offset pagination would require an API change. Library and author/admin ScrollViews should be profiled with realistic large datasets before restructuring them. Offline downloads already limit parallel chapter requests to four; shared manifest updates need a separate storage audit under concurrent download/delete workloads. No new thumbnail CDN endpoint or image dependency was introduced.

Measure the same revision, account and staging dataset on low-end Android (2?4 GB), mid-range Android, flagship Android, older supported iPhone and current iPhone. Record 10 cold starts and 10 warm starts, Home-to-reader navigation p50/p95, dropped frames during fast rail scrolling, peak memory for a long chapter and a 5,000-chapter table of contents, request counts/bytes, and memory after 20 navigation cycles. Exercise free/VIP, both currencies, ads/IAP sandbox, author edits, page/scroll/speech modes, quote sharing, offline license expiry, reconnect and account switching. Compare cache-cold and cache-warm runs separately, using identical network conditions. Do not interpret Metro compile duration as app startup time.

Use release builds for acceptance: `npx expo run:android --variant release` and `npx expo run:ios --configuration Release` on appropriate native hosts, or the existing EAS profiles. Use development builds to find regressions, then repeat on release; Expo's production mode removes development overhead. Physical-device FPS, native heap and release startup measurements were unavailable in this Windows workspace.

References: [React Native FlatList tuning](https://reactnative.dev/docs/optimizing-flatlist-configuration), [React Native Image](https://reactnative.dev/docs/Image), [Expo development versus production](https://docs.expo.dev/workflow/development-mode/).
