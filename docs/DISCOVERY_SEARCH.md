# CHƯƠNG — Phase 4G-A Search & Discovery

## What is implemented

The Discover tab now uses server-side search instead of loading the full public catalog and filtering it in JavaScript.

Search supports:

- Vietnamese accent-insensitive queries
  - `Kiếm Yên` can be found with `kiem yen`
  - `Thành Phố` can be found with `thanh pho`
- book title
- description
- tags
- author pen name
- genre
- filters:
  - genre
  - free / VIP
  - ongoing / completed / paused
- sorting:
  - relevance
  - popularity
  - newest update
  - rating
- result counts
- local recent-search history

## Public-safety boundary

The search RPC explicitly requires:

- book visibility = public
- book status != draft
- book moderation = approved
- author moderation = approved

The RPC is `SECURITY INVOKER`, so normal RLS remains active in addition to those explicit filters.

Hidden/rejected/private/draft content must never be returned by public discovery.

## Ranking

Popularity uses real platform fields only:

- views_count
- followers_count
- rating
- updated_at freshness

No fabricated trend or engagement values are injected.

When a text query exists, text relevance is the primary rank and the real-signal popularity score is only a small tie/quality signal.

## Search scale hardening

Enabled PostgreSQL extensions:

- `unaccent`
- `pg_trgm`

Indexes:

- normalized book title trigram
- normalized author pen name trigram
- normalized genre trigram
- materialized normalized `books.search_text` trigram
- public discovery ordering index

`books.search_text` is maintained by a database trigger from:

- title
- description
- tags

This avoids rebuilding the full normalized document for every search request.

Author and genre remain separate indexed signals so changes to an author or genre do not require rewriting every book's materialized search text.

## Search history

Search history is device-local in AsyncStorage.

Properties:

- works for anonymous and signed-in readers
- stores at most eight recent terms
- de-duplicates accent/case-equivalent entries
- user can remove one term or clear all
- search history is not uploaded to the server in this phase

## Production verification

Production starter catalog currently contains four public demo books.

Verified:

- `kiem yen` -> only Kiếm Yên Vân
- `thanh pho` -> only Thành Phố Sau Mưa
- genre aggregation returns the four real production demo genres
- all current public books were backfilled with normalized `search_text`
- CI TypeScript + web export passed for the Discover UI/service changes

## Future discovery work

The next recommendation layer can use consent-safe first-party signals such as:

- current library/favorites
- followed authors/books
- genres of actually read books
- recent reading progress

Do not infer sensitive traits and do not use paid AI for basic ranking when deterministic first-party signals are sufficient.
