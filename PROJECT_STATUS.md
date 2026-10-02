# CHƯƠNG — PROJECT STATUS

Updated: 2026-10-02 (Phase 2 core reading experience)

## Completed

- Preserved the existing warm-paper Home, burgundy brand identity, Home structure, and 5-tab navigation.
- Added a typed reusable data model with 12 fictional Vietnamese novels and realistic generated chapter metadata.
- Made Home book cards and major Home actions navigable.
- Added premium Book Detail at `/book/[id]` with reading CTA, metadata, author follow, library state, download demo, chapter preview, ratings, comments, and similar books.
- Added searchable/sortable/filterable full chapter list at `/book/[id]/chapters`.
- Added the core Reader at `/reader/[bookId]?chapter=N` with long Vietnamese reading content, constrained web width, tap-to-toggle controls, chapter navigation, chapter picker, community preview, and locally persisted bookmarks.
- Added locally persisted Reader Settings: font size/family, line spacing, white/paper/night/AMOLED themes, page padding, vertical scroll, and clearly marked page-mode preview.
- Added functional demo Audio/TTS sheet with playback, seek, progress, speed, voice, chapter controls, and sleep timer choices. A provider interface is ready for later cloud TTS integration.
- Added deterministic AI tool menu and screens: Convert (`/ai/convert`), spoiler-safe recap (`/ai/recap`), and story chat (`/ai/chat`). No API key is required; AI logic is isolated in `services/ai.ts` for a future gateway.
- Added shared `BookCard`, `ChapterRow`, `SectionHeader`, `BottomSheet`, `ReaderToolbar`, `EmptyState`, and `LoadingState` components.
- Added local/demo comment likes, replies/report feedback, library/follow/download state, and share actions.
- Validation passed: `npm run typecheck`, `npm run build`, and `git diff --check`.
- Existing Expo web preview remained running on port 3000; Home and all requested route URLs returned HTTP 200.

## Pending

- Interactive visual/device QA in Vibaocode Pixel, a small Android viewport, and a modern iPhone viewport (the sandbox exposed the running preview but no browser automation binary).
- Commit and push the intended product changes to `origin/main` from an environment authorized to perform Git writes/remotes.
- Future backend phases: real account sync, CHƯƠNG content/download backend, community backend, AI Gateway, and cloud TTS.

## Known issues

- Page-turn reading mode is intentionally labeled as a preview and currently retains vertical scrolling.
- AI, audio playback, downloads, comments, replies, and reports are deterministic/local demos as required for Phase 2.
- The current working tree also contains pre-existing Vibaocode runtime/control files plus pre-existing `.gitignore`, `expo-env.d.ts`, and untracked `package-lock.json` changes; these were preserved and not treated as product edits.
- Changes are not committed or pushed because this Codex environment explicitly prohibits commit/push operations.

## Current SHA

`5fb76956edc2def32cd8533c008847269ff4598e` (local `HEAD` equals `origin/main`; Phase 2 changes are present in the working tree and are not yet committed).

## Exact next task

Open the running app in Vibaocode Pixel and interactively verify Home → Book Detail → Chapter List → Reader → Reader Settings → AI → Audio at mobile widths. If the visual pass is clean, stage only the intended app/source/status files (excluding Vibaocode control files), commit with `feat: build core CHUONG reading experience`, push to `origin/main`, fetch, and verify local `HEAD` equals `origin/main`.
