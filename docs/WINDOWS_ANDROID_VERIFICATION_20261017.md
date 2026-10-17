# CHƯƠNG Windows / Android verification — 2026-10-17

## Workspace and safety

- Working branch: `feat/admob-android-20261016`, fetched from origin before editing.
- Original workspace source/configuration backup: `.cache/backups/before-admob-20261016-234047`.
- Native build copy: `D:\ChuongAndroid-20261016`. Expo prebuild failed to locate MainApplication under the original non-ASCII path, then succeeded in this copy.
- No production SQL, Edge Function deployment, live-ad activation, store publication, real purchase, or revenue policy changes were performed.
- No environment file or private credential was added to version control. Machine terminal configuration is ignored.

## Environment

- Git 2.55.0.windows.5, Node 22.23.2, npm 10.9.8 installed with winget.
- Microsoft OpenJDK 17.0.20.1; user JAVA_HOME configured.
- Android Studio installed with winget.
- Android SDK at `D:\Android\Sdk`; user ANDROID_HOME and PATH configured.
- SDK platform 36; Build Tools 35.0.0 and 36.0.0; platform-tools; NDK 27.1.12297006.
- Gradle wrapper 8.14.3.
- Samsung SM-T385K (`5dabf420`): Android 9/API 28, armeabi-v7a. Initially authorized successfully, then became offline/disappeared. Samsung-signed USB driver installer was moved to `D:\Android\SamsungUsbDriver.exe` after NSIS failed under the original workspace path; the Samsung MSS InstallWizard then opened successfully. Driver installation completed and ADB subsequently recognized the authorized device again.

## Changes

- Added Expo development client; Android/iOS scripts build native apps.
- Pinned Google Mobile Ads wrapper to 16.3.4: 16.5.0 pulled Google Ads 25.4, whose Kotlin 2.3 metadata failed under Expo 54's Kotlin 2.1 compiler. Replacement compiled successfully in the native APK build.
- Sample App IDs remain the default even in production; live App IDs require an explicit production build opt-in. Delayed measurement initialization enabled.
- Sample-only development builds do not depend on publisher UMP message configuration; live builds retain the consent gate.
- Reward loading timeout no longer expires while a long video plays; the app waits for close before returning an earned result. Client events never credit wallets.
- Authenticated accounts with unverifiable membership suppress ads, including when no VIP cache is available.
- SSV rejects duplicate/oversized query parameters, refreshes keys after an unknown key, supports current PostgREST JWT claims, and rejects NULL reward arguments.
- Image picker no longer requests microphone access.
- Fixed Windows file URL handling in release and UI-copy checks; the latter previously could skip all source files.
- Added an EAS closedTesting App Bundle profile with live ads explicitly disabled. This does not submit an app.

## Completed checks

- `npm ci` passed after retrying a transient Windows EBUSY lock.
- `npm run verify` passed before the native dependency pin; typecheck, release and AdMob checks were repeated after the pin.
- Database tests use disposable PGlite databases: roles/RLS, publishing, wallet security, high/low currencies, author source channels, actual-pool settlement, refunds, debt, payout reservations/cancellation/payment, notifications and author release regressions passed.
- AdMob tests cover five-stone credit, direct claim denial, idempotency, one reward per UTC day, NULL arguments, modern JWT claims, long/closed/failed videos, ECDSA signatures and tampering, sample App IDs, and VIP/offline suppression.
- 25 existing UI tests obtained passing results: 20 mocked-backend tests, 4 demo tests and 1 artwork test. Initial cold Metro timeouts and a shared trace directory collision were resolved by warm compilation, longer local timeouts and separate output directories. No product assertion failure remained in the final runs.
- Web production export passed. Public Supabase book read returned HTTP 200. Native APK package is `vn.chuong.app` version 1.0.0 (code 1), target 36, ARMv7; apksigner verification passed. Merged APK permissions contain no RECORD_AUDIO. A local copy is at `.cache/artifacts/chuong-development-armv7.apk` (55,983,674 bytes; SHA-256 `D4BB8910E6EF4961C783B7451ED8143F09693EC382E2EF909EE957C2CC911D87`).
- `git diff --check` passed.

## Limits and remaining acceptance work

- Native ARMv7 debug APK build passed (390 tasks; rebuild 2m56s). Artifact: `D:\ChuongAndroid-20261016\android\app\build\outputs\apk\debug\app-debug.apk`. APK installation succeeded via ADB; port 8081 reverse forwarding and Metro connection succeeded. The app loaded a live Supabase book, rendered chapter 1 and chapter 2, and showed the official Google 728x90 sample banner. No CHƯƠNG fatal crash was observed during these smoke tests. Native TTS playback, authenticated flows and offline playback remain pending; do not claim full device acceptance.
- UI login/payment flows use mocked backend responses; no real credentials or money were used.
- Official demo rewarded ads are not proof of a publisher's live SSV/wallet integration. Verified credit is tested independently with local cryptographic callbacks and an isolated database; do not bypass SSV to make a demo wallet appear credited.
- Production migration/function deployment requires owner approval. Review `202610160002_admob_verified_rewards.sql`, `admob-ssv`, and the preceding author revenue channel migration together on staging first.
- Author share percentages and low-stone pool valuation are unchanged. Hạ Phẩm has no fixed VND conversion; the pool uses reconciled actual revenue.
- npm audit snapshot: 44 vulnerabilities (24 high, 20 moderate), saved only in `.cache/npm-audit.json`. Some suggested fixes change Expo/RN major versions; release requires a separate compatible dependency remediation review.
- The target branch lacks a complete public privacy-policy/account-deletion flow. The original branch backup includes related draft work; it was preserved, not blindly merged with the new financial migrations. Final legal/retention policy and operational deletion handling need review before release.
- EAS projectId/signing, Play Console products/license testers, privacy/Data Safety/deletion URLs, AdMob app review, app-ads.txt, and signed SSV callback configuration are still external release requirements.
- The ARM 32-bit debug build is for this tablet only. Store bundles must retain arm64 support and appropriate production signing; no debug APK should be uploaded as the release artifact.
- Google TTS was installed and its Vietnamese pack was listed, but tts_default_synth was unset. Selected com.google.android.tts as the device default; the native ExpoSpeech module subsequently returned vi-VN voices. The previous unset preference can be restored with `adb shell settings delete secure tts_default_synth`. TTS voice discovery now refreshes after returning from system Settings; typecheck passed. Actual playback remains to be retested.
- Owner is entering test account credentials directly on the Samsung. Screen capture/UI inspection is paused until the owner confirms login completion. No password is requested or recorded.
- Commit/push is deferred until the remaining native acceptance checks pass, as requested by the owner.

## Cập nhật tối ưu hiệu năng

Xem `PERFORMANCE_20261017.md` cho phạm vi tối ưu và bằng chứng mới. Bản release nội bộ ARMv7 đã build và cài cập nhật qua USB thành công, không cần Metro. Kiểm tra công khai sau tối ưu gồm trang chủ, khám phá, thư viện, đọc/chuyển chương và cuộn. Các luồng tài khoản, thanh toán, thưởng và phát âm TTS trên máy thật vẫn cần nghiệm thu; chưa commit/push khi phần nghiệm thu còn thiếu theo điều kiện ban đầu.

Cập nhật trình đọc cuối: xem READER_ANDROID_FIX_20261017.md. Release đã cài lại thành công, 24 ca reader có kết quả đạt sau chạy lại lỗi môi trường. Các giới hạn nghiệm thu native còn lại được giữ rõ trong báo cáo mới.
