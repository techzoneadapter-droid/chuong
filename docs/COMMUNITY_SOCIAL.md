# CHƯƠNG Community / Social (Phase 4K)

Phase 4K adds reader-to-reader social features without turning private reading history into public social data.

## Reader profile

Public reader profiles expose only identity/social fields intended for display:

- display name
- username
- avatar
- bio
- role
- follower/following counts
- privacy-filtered public shelf
- privacy-filtered review/comment activity

The app intentionally does **not** publish:

- reading progress
- current chapter
- scroll position
- bookmarks
- reading history
- offline/download state
- "Đang đọc" library entries

## Public shelf

The public shelf RPC can return only:

- favorite
- completed

It never returns reading.

Only public, non-draft, moderation-approved books from moderation-approved authors can appear.

Shelf sharing is opt-in by default for Phase 4K.

## Public activity

Reader activity uses already-public, moderation-approved content:

- book reviews
- book/chapter comments

The profile/activity aggregation controls do not make private data public. They only decide whether already-public reviews/comments are aggregated onto the reader profile and follower feed.

Review/comment aggregation is opt-in by default.

## Follow relationships

Authenticated readers can follow/unfollow other profiles.

Following is denied when:

- the target is the same user
- the target does not accept follows
- the target profile is not public
- either side has blocked the other

Turning off "Cho phép người khác theo dõi" removes current followers of that profile.

## Mute

Mute is private to the muting account.

Muted readers:

- remain followed unless separately unfollowed
- do not appear in the muting user's community feed

The target does not receive a public mute state.

## Block

Blocking:

- removes follow relationships in both directions
- clears the blocker's mute row for that target
- prevents new follows between the pair
- hides public shelf/activity across the blocked relationship

Unblocking does not restore old follows automatically.

## Privacy controls

reader_privacy stores:

- profile_public
- show_shelves
- show_reviews
- show_comments
- allow_follows

Defaults:

- public profile identity: on
- accepts follows: on
- shelf aggregation: off
- review aggregation: off
- comment aggregation: off

This preserves the profile identity model that existed before Phase 4K while making newly aggregated social activity opt-in.

## Database security

Social relationship tables have RLS enabled:

- reader_privacy
- reader_follows
- reader_blocks
- reader_mutes

Direct anonymous table access is revoked.

Authenticated-only RPCs:

- get_my_reader_privacy
- update_reader_privacy
- set_reader_follow
- set_reader_mute
- set_reader_block
- get_community_feed

Privacy-filtered public read RPCs:

- get_public_reader_profile
- get_public_reader_shelf
- get_reader_public_activity
- search_public_readers

The public read RPCs are intentionally SECURITY DEFINER so they can evaluate private follow/block/privacy tables while returning only constrained public data. They use an explicit safe search_path.

Supabase Security Advisor will therefore still report four intentional anonymous SECURITY DEFINER warnings for those public read RPCs. Authenticated SECURITY DEFINER warnings also exist for multiple existing RPC endpoints; each endpoint still performs its own authorization checks.

## Production verification

A transaction-only production test used two existing profile rows and rolled back all changes.

Verified:

- follow creates the expected relationship
- mute works
- block removes follow relationships
- block clears the actor's mute relationship
- private profile / disabled-follow state rejects a new follow
- public shelf RPC cannot return reading
- rollback left no test relationship/privacy mutations behind

A real defect was found during this verification: the privacy RPC upsert used an ambiguous user_id identifier because RETURNS TABLE creates a PL/pgSQL output variable with the same name. This was corrected using ON CONFLICT ON CONSTRAINT reader_privacy_pkey.

Function ACL verification confirms anonymous callers cannot execute authenticated-only social mutation/feed/privacy RPCs.

## Source surfaces

- services/community.ts
- app/community/index.tsx
- app/user/[id].tsx
- app/profile/privacy.tsx
- app/(tabs)/profile.tsx
- components/BookReviews.tsx
- components/Comments.tsx

## Migrations

- 202610030040_phase4k_social_community.sql
- 202610030041_phase4k_acl_hardening.sql
- 202610030042_phase4k_privacy_rpc_fix.sql
- 202610030043_phase4k_privacy_safe_defaults.sql

## Remaining release QA

Before store release, verify on physical Android/iOS devices:

- profile/discovery navigation
- follow/unfollow across two real accounts
- mute feed filtering
- block/unblock from both sides
- privacy switches after app restart
- profile hidden state while another account is viewing
- long review/comment text rendering in feed
- deep navigation from activity to the correct book/chapter context
