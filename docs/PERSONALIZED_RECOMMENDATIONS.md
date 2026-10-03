# CHƯƠNG — Phase 4G-B Personalized Recommendations

## Goal

Provide a useful "Dành cho bạn" feed from first-party reading behavior without sending reading history to a paid AI model.

## Signals used

For signed-in readers, ranking can use only CHƯƠNG first-party interaction data:

- reading progress
- library state
  - favorite
  - reading
  - completed
- followed books
- followed authors
- genres of books the user actually interacted with

Anonymous readers receive the normal popularity/freshness fallback.

## Ranking behavior

Candidate books must still pass the public discovery boundary:

- visibility = public
- status != draft
- book moderation = approved
- author moderation = approved

Ranking combines:

- matching genres
- familiar/followed authors
- public engagement fields
  - views
  - followers
  - rating
  - freshness

Books already in reading/library/follow signals are placed after unseen books, so "Dành cho bạn" behaves as discovery rather than simply repeating the user's current library.

## Explanations

Each recommendation returns a simple reason:

- followed author
- favorite/read genre
- familiar author
- popular on CHƯƠNG

The UI displays the reason next to each recommendation.

## User control

Signed-in users can choose "Ẩn" on any recommendation.

Hidden recommendations are stored in:

`recommendation_feedback`

Only the owner can read/write their feedback through RLS.

The full recommendation screen also provides:

`Khôi phục truyện đã ẩn`

so hiding a recommendation is reversible.

## Home improvements

Home now:

- chooses the most recently-read book for the "Đang đọc gần nhất" hero instead of assuming the first catalog book
- loads personalized recommendations from the server
- shows explanation labels for recommendation reasons
- links to a full `/recommendations` screen

## Privacy boundary

This phase does not:

- infer sensitive personal traits
- send reading history to an external AI provider
- expose one user's recommendation signals to another user
- use hidden/private/moderated books as public recommendations

## Production verification

Temporary production test user:

- favorited/read Kiếm Yên Vân
- followed the author
- recommendation feed became personalized
- unseen books were ranked before the already-read book
- hiding Thành Phố Sau Mưa removed it from subsequent recommendation results
- deleting the temporary auth user cascaded all test library/progress/feedback rows

The temporary test user and all test rows were removed after verification.
