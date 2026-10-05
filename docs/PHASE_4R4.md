# Phase 4R4 — Public author hub and book release alerts

`/creator/[id]` uses the **author ID**. Book Detail's author avatar/name opens
this hub. Community/comment identities continue using `/user/[id]` and
`reader_follows`; author content following continues using `author_follows`.
Both screens refresh that same state on focus. Existing follower counter
triggers remain responsible for counts.

The hub shows public pen name, avatar, bio, verification, follower count and
public book count. It reuses XianxiaBackdrop, BookCard and AuthorGiftSheet;
gifts target the newest eligible public book, without changing accounting.
Anonymous follow/gift actions request login; self-follow/self-gift actions are
unavailable. Loading, retry, unavailable author, empty catalog and pagination
end states use Vietnamese copy.

## Public API and privacy

- `get_public_author_hub(uuid)` exposes an explicit public metadata whitelist
  and the current viewer's follow/self/interaction flags, never the author's
  account ID, moderation notes, financial data or reader shelves.
- `get_public_author_books(uuid, integer, integer)` caps each page at 20, checks
  public visibility, non-draft status and approved book **and author**, even for
  the owner/admin. It returns no chapter bodies or manuscripts.
- Ordering uses immutable first-release ledger time, then book update time and
  a stable ID tie-breaker. Historical release time uses creation time as an
  approximation, because no previous book release timestamp exists.
- Existing bidirectional community blocks suppress hub/catalog access, new
  author-follow inserts and release alerts. Reader privacy and social follow
  policies remain intact. Unfollowing is still allowed.
- Existing author/book and genre indexes are reused; no new index was added
  without production scale/query-plan evidence.

## Publication and notification behavior

Migration `202610050023_public_author_hub.sql` adds a private RLS-protected,
client-inaccessible `author_book_publications` ledger. Its book primary key
claims the first eligible public release atomically. Edits, retries, hiding and
restoring, and private/public round trips cannot replay that claim. Approval
of a previously hidden author also checks eligible, unclaimed books.

Before installing triggers, the migration locks books/authors and seeds
existing non-draft books plus drafts with published chapters. **No historical
notifications are emitted.** This is conservative: a pre-R4 private non-draft
book that never actually released will also be seeded. Conversely, a book
previously public but now draft with no surviving published chapter evidence
cannot be identified from the old schema. All new R4 releases have exact
ledger history. Deleted books cascade their ledger entries; a recreated book
with a new identity is a new release.

Notifications reuse category `release`, event `book_published`, and the existing
unique `(user_id, dedupe_key)` index. Dedupe keys include reader, actual
`books.author_id` and UTC hour. Display-only `credited_author_name` does not
resolve an author identity. Initial alerts open `/book/{id}`; batches open
`/creator/{authorId}` and increment `batch_count` through a database upsert.
Only the initial INSERT queues push. Metadata contains public author/book IDs,
titles, counts and batch times. Existing notification read/creation times are
preserved when a batch grows.

`new_books` defaults to true and is separate from `new_chapters`. Both honor
`in_app_enabled`; new-book push also requires `push_enabled` and an enabled,
non-invalidated device. The shared push trigger dispatches this event through
its new-book preference branch, leaving chapter/other category behavior intact.

The obsolete nine-argument preference signature is replaced with a ten-argument
function whose final `p_new_books` defaults to NULL. Nine-argument R1 clients
preserve existing opt-outs. The eight-argument pre-R1 function remains for
older deployed clients and likewise preserves both release preferences.

## Verification on 2026-10-05

- Production schema and RLS inspected before implementation; only R4 migration
  applied to `chuong` (`lwchpifeahyuoajeidsa`). One historical ledger entry,
  zero missing seeds and zero release notifications before/after installation.
- `tests/author-releases-production.sql` passed in a transaction ending with
  ROLLBACK: follow/unfollow/counters, single release, edits/restoration replay,
  five-book batch, two enabled-device pushes, author separation, preference
  opt-out, old RPC compatibility, push-disabled in-app behavior, catalog privacy
  and private helper permissions. No fake production content committed.
- Existing R3 production rollback smoke test passed after R4, including sparse
  Update Center unread calculations and VIP protection. Post-test checks found
  zero temporary books/devices, zero release notifications and zero push rows.
- Security Advisor run after migration. Public SECURITY DEFINER hub/catalog
  warnings are intentional: explicit eligibility, block and column-whitelist
  checks are needed to expose only public data independent of owner/admin RLS.
  Private-ledger RLS-without-policies INFO is intentional deny-all client access.
  Existing unrelated RPC/auth warnings were left unchanged.
- Local database tests include the real migration, UTC hour boundaries,
  pagination, author approval, ownership versus display credit, social/block
  preservation and R3 smoke checks after R4. The database uniqueness/upsert
  design enforces concurrent batching; no production multi-session load test
  or real Expo device delivery was performed.
- Browser backend suite: 20 passed, 4 demo-only checks skipped. Includes mobile/desktop
  Creator Hub pagination, follow synchronization, anonymous gates and preference saves.
  A separate clean demo export passed all 4 demo/artwork checks (20 backend checks
  skipped in that mode).
- `npm run verify` passes (typecheck, UI copy, admin syntax, release checks,
  database/economy suites, web build). Browser tests use a mock public endpoint;
  native push delivery still depends on existing EAS/device configuration.

Source changes remain uncommitted in the requested working tree; no push or
application hosting deployment was performed.
