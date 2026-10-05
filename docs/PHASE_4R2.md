# Followed book updates

`/updates` uses only the signed-in reader's production follows and progress.
Home shows up to two followed books with chapters ahead and a total chapter badge;
the library also links to the full update center.

## Database contract

Migration: `202610050021_followed_book_updates.sql`.

- `get_my_followed_book_updates(p_limit = 20, p_offset = 0, p_updates_only = false)`
  returns safe book, author, and chapter metadata. Page size is capped at 50.
- `get_my_followed_book_update_badge()` returns `updated_books` and `unread_chapters`.
- Both functions use `SECURITY INVOKER`, an empty search path, existing RLS, and
  explicit `auth.uid()` filters on follows and progress. Anonymous execution is revoked.
- Public, non-draft, approved books with approved authors are eligible. Only
  published, approved chapters count. Draft/scheduled slots do not count until released.
- Unread count is the number of real chapter rows above `reading_progress.chapter_number`.
  The next chapter is their minimum number; no progress uses the first real chapter.
  Removing the current chapter keeps its stored numeric position.
- Latest chapter means the greatest available chapter number. Its publication
  timestamp is shown on the card; sorting uses the most recent publication timestamp
  across available chapters, with unread books first and book ID as a stable tie breaker.
- There are no content fields, entitlement changes, wallet writes, or notification writes.
  CTAs enter the existing Reader and its normal paywall.

The existing `(user_id, book_id)` primary keys cover follows/progress lookup.
One partial chapter index covers published/approved metadata scans and chapter
number range lookup. The badge reads only chapter counts; clients never query
chapters per followed book. Exact counts scale with eligible chapter metadata,
without storing any per-reader/per-chapter update rows.

The full screen loads pages on demand, deduplicates concurrent catalog shifts,
ignores obsolete responses after navigation/account changes, and refreshes on
focus or pull-to-refresh. An offset page may shift when publication/progress changes;
refresh restarts the ordered list. Counts clear through existing progress sync.

## Validation

`npm run test:db` includes `tests/followed-updates.mjs`, which executes real SQL
in local PostgreSQL (PGlite). It covers sparse numbers `1,2,3,5,8`, missing chapter
1, no progress, caught up, removed progress chapters, moderation, private books,
anonymous permissions, reader isolation, VIP metadata/body gating, pagination,
the index plan, scheduled publishing, manual publishing, release deduplication,
the `new_chapters` preference, and exact notification reader routes.

`tests/web/backend.spec.ts` adds update center/browser regression scenarios using
the suite's isolated mock backend. Production code contains no fixture fallback.
Run this suite against an Expo web export configured for `http://127.0.0.1:54321`
with a test public key and `EXPO_PUBLIC_SUPABASE_MODE=production`, using
`TEST_BACKEND=1 TEST_BASE_URL=<preview URL> npm run test:web`.
Use a fresh Metro export cache when switching backend configuration.

Production: the additive `followed_book_updates` migration was applied through
the connected Supabase project. Schema and indexes were inspected first; both
RPCs were then verified in a rolled-back authenticated session with a UID that
has no follows, returning an empty list and zero counts. Invoker/search-path and
anonymous ACL checks passed. No production books, progress, balances, or revenue
were modified or seeded.
