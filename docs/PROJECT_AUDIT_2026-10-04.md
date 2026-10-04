# CHƯƠNG — Full project audit — 2026-10-04

This audit reviews the current mobile/web source, production Supabase state, release gates and Content Studio management path.

## Executive status

- Mobile/web application source: active and CI-gated.
- Production Supabase: connected and structurally healthy.
- Content Studio Web: admin-only catalog/upload/editor path implemented.
- Runtime UI copy: Han/CJK characters are forbidden by automated test.
- Native store release: not ready until real EAS/store/AdMob credentials and physical-device QA are completed.

## Production data integrity checked

At audit time:

- public tables: 47
- tables with RLS enabled: 47
- books: 4
- public books: 4
- chapters: 8
- published chapters: 8
- admin profiles: 1
- active Premium subscriptions: 0
- duplicate `(book_id, chapter_number)` pairs: 0
- public books without any published chapter: 0

The current starter catalog is internally consistent.

## Active Edge Functions

- `iap-verify`
- `iap-events`
- `push-dispatch`
- `ai-translate-book`
- `subscription-verify`

## Content Studio Web

The repository already contained the first Content Studio shell. This audit upgrades it into a practical browser-first management app rather than creating a second competing catalog/admin implementation.

Current routes:

- `/studio/login`
- `/studio`
- `/studio/upload`
- `/studio/book/[bookId]`
- `/studio/book/[bookId]/chapter/[chapterId]`

Capabilities:

- dedicated Admin login
- catalog metrics/search/status filters
- TXT/DOCX/ZIP bulk story upload
- parsed-story preview before writes
- cover replacement
- metadata/genre/tags/source-rights editing
- book lifecycle control
- individual chapter publish/hide
- chapter search and 50-item pagination for long novels
- full chapter editor
- free/VIP chapter access and Linh Thạch price
- create/delete draft chapters
- large imports written in bounded 25-chapter batches
- batch imports are staged as drafts before mass publication, preventing a partially uploaded novel from becoming partially public
- direct mobile-reader preview links

All Studio writes use the same Supabase catalog/storage as the mobile application.

## UI language rule

`npm run test:ui-copy` scans runtime source under:

- app
- components
- constants
- data
- hooks
- services

It fails when it finds a literal character in Han Unicode ranges.

This protects interface labels, buttons, badges, helper copy and runtime messages from accidental Chinese-character regressions.

User-uploaded story content is not scanned or rewritten by this rule.

## Backend / security notes

Good:

- every public table currently has RLS enabled
- catalog integrity checks above pass
- Premium and AI permissions are server-checked
- store subscription verification and event reconciliation live in Edge Functions
- Content Studio client role checks are backed by database policies

Supabase Advisor currently reports warnings for callable `SECURITY DEFINER` RPCs. Several are intentionally public privacy-filtered reads or authenticated mutation RPCs with their own identity/admin checks. They should remain under review; an advisor warning by itself is not treated as proof of a vulnerability.

Performance Advisor currently reports unused-index notices on the small dataset and several multiple-permissive-policy warnings. These are optimization items, not current data-integrity failures. Do not drop indexes or merge policies blindly before production traffic proves the query patterns.

## Large-catalog risks addressed

- Admin chapter import no longer sends one unlimited insert payload.
- Existing chapter-number conflicts are checked in bounded groups.
- Inserts are batched.
- Failed batch upload removes already inserted draft rows where possible.
- Publish happens only after all draft batches were inserted.
- Studio no longer stops management at the first 120 chapters; chapter search + pagination supports long books.

## Remaining real-world blockers

These require owner accounts, external credentials or physical devices:

1. link the real Expo/EAS project ID
2. create/activate `chuong.vip.monthly` in Google Play and App Store Connect
3. configure real Google Play/App Store verification credentials
4. configure production AdMob App IDs/Banner IDs
5. configure production AI provider key/model for Premium whole-book translation
6. configure FCM/APNs for real push delivery
7. run Android/iOS physical-device regression
8. test real purchase, renewal, cancellation, refund and restore
9. test TTS Vietnamese voices on real devices
10. complete store listing/privacy/data-safety/support assets

## Release decision

Do not submit to stores yet.

The next safe milestone after this audit is an Android development/release-candidate build with real store/AdMob configuration, followed by device QA.
