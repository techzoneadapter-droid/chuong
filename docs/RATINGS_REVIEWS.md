# CHƯƠNG — Phase 4I Ratings & Reviews

## Product behavior

Phase 4I replaces the previous placeholder rating block with a real first-party reader rating and review system.

A signed-in reader can:

- rate a public book from 1 to 5 stars
- keep exactly one rating/review per book
- write up to 4,000 characters
- mark the review as containing spoilers
- edit or delete their own review
- mark another reader's review as useful
- report a review through the existing moderation flow

Authors cannot rate their own books.

## Canonical rating aggregate

The canonical book score is maintained from approved review rows only.

Stored on `books`:

- `rating`
- `rating_count`

The aggregate refreshes when:

- a review is inserted
- a review is deleted
- its rating changes
- moderation state changes

Helpful votes and review-text-only edits do not recalculate the book rating.

## Review visibility and moderation

Reviews use the existing moderation states:

- approved
- hidden
- rejected

Public readers only see approved reviews.

The review owner, the book author and administrators retain appropriate RLS visibility for their own/managed data.

Reports now support `review_id` as a first-class moderation target.

Admin review-report detail shows:

- book title
- reviewer name
- star score
- spoiler flag
- current moderation state
- review text

Admin approve/hide/reject uses the same moderation audit trail as books, chapters, comments and authors.

## Spoiler UX

Reviews marked as spoilers are collapsed for other readers.

The reader must explicitly tap to reveal the review body.

The review author can always see their own text.

## Useful sorting

Book Review UI supports:

- Useful
- Newest
- Highest score
- Lowest score

Useful votes are unique per user/review and maintained as a cached counter on the review row.

## Anti-abuse foundation

Database enforcement includes:

- one review per reader/book
- authors cannot rate their own book
- maximum 10 newly-created reviews per account per hour
- five-second edit cooldown
- immutable review owner/book on edit
- users cannot directly modify moderation fields or useful-count totals
- review-text length constraint
- rating 1–5 constraint
- RLS for reads/writes/helpful votes
- database-managed aggregate rating fields

This is a baseline abuse-control layer, not a full fraud-scoring system.

## Author Studio

Author Studio now links to `/author/reviews`.

The dashboard shows:

- weighted rating across the author's books
- rating count by book
- per-book score
- recent reader reviews
- spoiler indicator
- useful count
- moderation status when relevant

Authors cannot edit/delete reader reviews or manipulate scores.

## Production verification

Temporary production test data verified:

- Reader One submitted 5 stars
- Reader Two submitted 3 stars with spoiler flag
- aggregate became 4.00 from 2 ratings
- Reader One marked Reader Two's review useful
- helpful count became 1
- a report targeting the review was created successfully
- the author was blocked from reviewing their own book
- an admin hid the 3-star review through the moderation RPC
- public aggregate immediately became 5.00 from 1 visible rating
- the hidden review disappeared from ordinary reader visibility
- moderation audit rows were created
- all temporary users, book, reviews, votes, reports and moderation rows were deleted afterward

## Migrations

- `202610030033_phase4i_reviews.sql`
- `202610030034_phase4i_trigger_hardening.sql`
- `202610030035_phase4i_rating_trigger_scope.sql`

## Main source files

- `services/reviews.ts`
- `components/BookReviews.tsx`
- `app/author/reviews.tsx`
- `services/moderation.ts`
- `app/report.tsx`
- `app/admin/reports.tsx`
- `app/admin/reports/[id].tsx`

## Remaining release QA

Before store release, validate on real accounts/devices:

- create/edit/delete review
- spoiler reveal
- useful vote toggle
- report -> admin moderation
- author review dashboard
- long review layout on small Android screens
- slow/offline error states
- account switching
