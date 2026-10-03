# CHƯƠNG — Phase 4H Offline Reading

## Scope

Phase 4H replaces the old download demo with a real device-local offline reading layer for Android/iOS, while keeping the Vibaocode/web preview usable.

## Native storage

Android/iOS:

- `expo-file-system`
- chapter bodies are stored as JSON payloads under the app document directory
- the manifest stays in AsyncStorage
- downloaded files remain private to the CHƯƠNG app sandbox

Web preview:

- uses AsyncStorage for both manifest and payloads
- intended for functional preview/testing only
- production offline reading should be validated in Android/iOS builds

## Downloads

Book Detail -> **Tải truyện** supports:

- current chapter
- next 20 published chapters
- all currently published chapters

The download manager:

- checks network reachability before downloading new content
- fetches in bounded batches of four chapters
- uses the normal entitlement-aware Reader RPC
- never bypasses VIP locks
- skips locked VIP chapters
- reports saved / locked / failed counts
- marks downloaded chapters in chapter lists

## VIP safety

A VIP chapter can only be downloaded after the normal server reading endpoint confirms access.

Downloaded VIP copies use a seven-day offline verification window.

When CHƯƠNG can contact the server again:

- an allowed chapter refreshes its downloaded copy
- a revoked/refunded/locked entitlement deletes the old offline chapter
- expired VIP copies require online verification before they can be opened

This is a product safety window, not a replacement for Google Play/App Store receipt reconciliation.

## Integrity

Every saved chapter includes:

- content version
- lightweight checksum
- saved timestamp
- manifest metadata

If a payload no longer matches its checksum, CHƯƠNG removes the broken local file and asks the reader to download it again.

## Storage quota

Default quota: **250 MB**.

User options:

- 100 MB
- 250 MB
- 500 MB
- 1 GB

If storage exceeds the selected quota, the app removes least-recently-used chapter payloads first while preserving the chapter currently being written.

The Downloads screen shows:

- total bytes used
- selected quota
- books/chapters stored
- expired VIP count
- per-book storage size
- delete one book
- delete all downloads

## Offline Reader

Reader can open a downloaded book without the catalog API being reachable.

When offline:

- book metadata falls back to the local snapshot
- chapter list falls back to downloaded chapter metadata
- chapter content comes from the local payload
- Reader displays an Offline marker
- comments are hidden and replaced with an offline notice
- exit returns to Downloads when the session is local-only

## Offline-first reading state

For signed-in readers, these states are cached per account on the device:

- library
- reading progress
- bookmarks

Writes are local-first.

When there is no network, changes are placed in the durable sync queue.

The queue is flushed:

- when the user signs in / app bridge starts
- when connectivity becomes reachable
- when app returns to foreground
- every 30 seconds while the app is active

Queue behavior:

- operations for the same logical item are coalesced
- failed operations use exponential backoff
- maximum automatic attempts: 8
- a newer action for the same item replaces the stalled one and starts again from attempt 0
- Downloads displays pending and stalled sync state

## Cross-device progress conflict safety

Production Supabase now exposes `sync_reading_progress()`.

It compares the client timestamp with the stored progress timestamp.

An old offline progress operation cannot overwrite newer progress written by another device.

Production verification:

1. wrote progress at 80% with a newer timestamp
2. replayed an older 20% update
3. server retained 80% / scroll position 1800
4. temporary account and progress row were removed afterward

Migration:

- `202610030031_phase4h_progress_sync.sql`

## Native dependencies

SDK 54 compatible packages:

- `expo-file-system ~19.0.24`
- `expo-network ~8.0.8`

## Required physical-device QA before release

Android and iOS preview/release builds still need manual checks for:

- app restart with downloaded chapters
- airplane mode launch and Reader navigation
- large-book download interruption/retry
- Android low-storage behavior
- iOS app sandbox persistence
- VIP expiry and reconnect refresh
- refund/revocation cache invalidation
- offline progress + bookmark changes followed by reconnect
- account switching with pending queues
- OS uninstall/reinstall behavior

Uninstalling the app is expected to remove app-local downloads.
