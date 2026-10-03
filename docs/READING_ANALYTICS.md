# CHƯƠNG — Phase 4J Reader Analytics & Retention

## Goal

Phase 4J turns the existing placeholder/cumulative reader metrics into first-party reading analytics designed to stay useful when CHƯƠNG has many concurrent readers.

The system records reading engagement without sending raw device identifiers to authors and without updating a single hot aggregate row on every scroll event.

## Reader tracking model

The Reader now creates one analytics session per opened chapter.

Client behavior:

- creates a random per-session ID
- keeps a persistent installation ID only on the device
- sends an initial reader-session event
- counts active foreground reading time
- sends a heartbeat every 30 seconds
- flushes best-effort on background, navigation and chapter change
- never blocks reading if analytics fails
- does not send analytics while reading from offline-only cache

Server behavior:

- hashes account/install identity before storage
- hashes session IDs before storage
- validates that the book/chapter is public, published and approved
- caps a session at six hours
- limits credited active time to elapsed wall-clock time
- records maximum progress monotonically
- marks a chapter session completed when progress reaches at least 90%
- deduplicates one reader/book/day and one reader/chapter/day

## Anti-spam view counting

`books.views_count` is no longer incremented on every Reader heartbeat.

A "view" is defined as one pseudonymous reader/book/day.

This prevents refresh spam from rapidly inflating a book's view count.

The cumulative view count is rebuilt from compact daily rollups, so cleanup of old pseudonymous detail rows does not erase historical totals.

## Scale architecture

Hot-path writes go primarily to per-session rows rather than one shared aggregate row.

Tables:

- `reader_engagement_sessions`
- `reader_book_days`
- `reader_chapter_days`
- `book_engagement_daily`
- `chapter_engagement_daily`

The first three detail tables are not directly readable by app users.

Aggregate rollups run every five minutes using `pg_cron`.

This design avoids serializing hundreds of concurrent readers on one book/day counter row every 30 seconds.

Retention cleanup:

- raw session detail: 180 days
- pseudonymous reader-day detail: 400 days
- compact daily aggregate rows: retained for long-term historical analytics

## Metrics

Author summary includes:

- distinct readers in the selected window
- returning readers
- reading sessions
- chapter starts
- chapter completions
- active reading time
- chapter completion rate
- returning-reader rate
- average active minutes/session

Author daily analytics includes:

- reader-days
- first/new reader-days
- returning reader-days
- sessions
- chapter completions
- active reading seconds

Per-book analytics includes:

- reader-days
- sessions
- chapter completions
- reading time
- completion rate

## Author Studio

New route:

- `/author/analytics`

Author Studio now links to **Phân tích độc giả**.

Available ranges:

- 7 days
- 30 days
- 90 days

The screen shows:

- reader health summary
- returning-reader percentage
- session duration
- completion rate
- aggregate active reading time
- simple daily reader trend
- per-book engagement breakdown

The dashboard intentionally states that aggregates can lag by about five minutes.

## Privacy

Authors receive aggregate metrics only.

They do not receive:

- installation IDs
- account IDs
- actor hashes
- individual reading histories
- session hashes

Pseudonymous actor/session rows are system-only and have explicit direct-access deny policies.

## Discovery & recommendation ranking

Books now have system-managed:

- `engagement_score`
- `engagement_updated_at`

The five-minute rollup calculates recent engagement using:

- unique reader-days
- sessions
- chapter completions
- active reading time
- returning-reader ratio

Discovery "popular" sorting and personalized recommendations now use a decaying recent-engagement signal in addition to:

- cumulative views
- follows
- ratings
- editorial freshness

Old engagement naturally loses ranking weight as time passes.

## Book freshness

Analytics and follower/rating metric writes no longer mutate the book's editorial `updated_at`.

Book freshness still changes for real content/editorial changes and published-chapter count changes.

This prevents reading traffic from making an old book appear newly updated.

## Production verification

Temporary production data verified:

- same anonymous session retried without creating a duplicate session
- one anonymous reader completed a chapter at 95%
- active reading time was credited as 120 seconds after elapsed-time validation
- two additional readers produced three distinct readers for the day
- a prior-day reader record produced one returning reader
- rollup result for the test day:
  - 3 unique readers
  - 2 new readers
  - 1 returning reader
  - 3 sessions
  - 3 chapter starts
  - 1 chapter completion
  - 120 active seconds
- author summary returned:
  - 3 readers
  - 1 returning reader
  - 33.33% return rate
  - 33.33% completion rate
  - 0.67 average active minutes/session
- cumulative test-book view count became 4 reader-days across two dates
- test-book recent engagement score became positive
- popular discovery ranked the engaged temporary book ahead of zero-engagement starter books
- unauthorized reader access to another author's summary was denied
- book editorial `updated_at` remained unchanged during analytics rollup
- all temporary Phase 4J users/books/chapters/sessions/reader-days/rollups were deleted afterward

## Production jobs

- `chuong-engagement-rollup`
  - every 5 minutes
- `chuong-engagement-retention`
  - daily at 03:17 UTC

## Migrations

- `202610030036_phase4j_reader_analytics.sql`
- `202610030037_phase4j_engagement_ranking.sql`
- `202610030038_phase4j_rollup_uuid_fix.sql`
- `202610030039_phase4j_advisor_hardening.sql`

## Main source files

- `services/analytics.ts`
- `hooks/useReadingAnalytics.ts`
- `app/reader/[bookId].tsx`
- `app/author/analytics.tsx`
- `app/(tabs)/write.tsx`

## Remaining real-device QA

Before store release, verify on physical Android/iOS builds:

- long reading session while screen stays active
- app background -> foreground
- chapter changes
- fast exit after reaching 90%
- intermittent network
- account sign-in/sign-out transitions
- offline downloaded reading
- device sleep / timer suspension
- multiple devices reading the same account
