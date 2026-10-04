# CHƯƠNG — Phase 4L Release Readiness

Phase 4L turns the previous feature-by-feature checks into repeatable release gates. It does **not** declare the app store-ready by itself; physical-device and store-console items still require real credentials/devices.

## Automated source gates

Every push to `main` and every pull request now runs:

### Core web-check

- `npm ci`
- `npx expo install --check`
- `npm run typecheck`
- `npm run test:release`
- `npm run test:db`
- `npm run build`

The static release audit verifies:

- stable CHƯƠNG app identity
- Android package ID `vn.chuong.app`
- iOS bundle ID `vn.chuong.app`
- `chuong://` deep-link scheme
- EAS preview/production profiles
- production native build auto-increment
- required release-critical routes/services/docs
- absence of common server-secret/private-key patterns in client source

Warnings are intentionally non-fatal for items that cannot be completed safely without the owner's real store/EAS assets.

### Browser regression gate

CI installs Chromium and runs two isolated Expo web previews:

1. **Demo Mode smoke**
   - public/demo routes
   - mobile-width overflow check
   - anonymous library persistence
   - bookmarks/progress persistence
   - reader settings
   - AI/audio demo
   - community/public-profile/privacy routes

2. **Mock-backend regression**
   - backend book/chapter rendering
   - sparse chapter navigation
   - missing-book behavior
   - authenticated profile restore
   - reader progress sync RPC
   - logout/login
   - serialized chapter autosave
   - failed publication rollback
   - community discovery
   - follow-reader RPC
   - public reader profile
   - public shelf/activity
   - privacy settings save

No production user credentials are required for browser CI.

## Production Supabase audit performed in Phase 4L

Current production checks:

- 44/44 public tables have RLS enabled
- 0 public tables have RLS disabled
- every current profile has a wallet row
- every current profile has a reader-privacy row
- book rating aggregates have no detected mismatch
- published chapter counters have no detected mismatch
- book follow counters have no detected mismatch
- author follow counters have no detected mismatch
- push-dispatch cron is active every minute
- engagement rollup cron is active every five minutes
- engagement retention cron is active daily
- Edge Functions are active:
  - `iap-verify`
  - `iap-events`
  - `push-dispatch`

The four anonymous `SECURITY DEFINER` warnings added by Phase 4K are intentional privacy-filtered public read RPCs:

- `get_public_reader_profile`
- `get_public_reader_shelf`
- `get_reader_public_activity`
- `search_public_readers`

Authenticated-only social mutation/privacy/feed RPCs remain unavailable to anonymous callers.

Performance Advisor currently reports only unused-index informational notices on the very small/new production dataset. Do not delete those indexes merely because they have not yet accumulated production usage.

## Manual blockers before store submission

These cannot be safely invented or completed from source code alone:

1. **Real Expo/EAS project link**
   - `app.json` still has no real `extra.eas.projectId`.
   - Link the app to the owner's Expo/EAS project before native push/build release testing.

2. **Store artwork**
   - final app icon
   - Android adaptive icon
   - custom splash artwork
   - Play Store feature graphic/screenshots
   - App Store screenshots if iOS is released

3. **Public version choice**
   - source is still version `0.1.0`.
   - choose the first public store version immediately before submission.

4. **Native notification credentials**
   - Android FCM v1
   - Apple APNs if iOS is released

5. **Store billing console setup**
   - create/activate the exact Google Play / App Store product IDs documented in `docs/IAP_SETUP.md`
   - verify real store receipts on an internal-test build
   - verify refunds/revocations through the store notification path

6. **Physical Android/iOS QA**
   - installation and first launch
   - sign-up/login/password recovery
   - account switching
   - deep links
   - offline downloads and airplane mode
   - interrupted downloads / low storage
   - push delivery and push deep links
   - IAP purchase / restore / refund
   - long reader sessions and background/foreground analytics
   - real Vietnamese TTS playback, speed/voice changes, sleep timer and auto-next
   - community follow/mute/block/privacy across two real accounts

## Release rule

Do not submit a production store build merely because TypeScript/web CI is green.

A release candidate is ready only when:

- automated CI is green on the exact candidate commit
- production database audit has no unexplained critical integrity/security finding
- EAS/store credentials are configured
- the exact native build passes physical-device regression
- IAP and push are verified using the real store/native infrastructure
- final artwork, store listing, privacy/data-safety declarations and support/contact information are complete
