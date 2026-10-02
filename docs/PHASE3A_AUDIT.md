# Phase 3A audit — 2026-10-02

Baseline HEAD/origin/main: `9f6724f08c98eed6e69d7ea3cb7c5ca3d9ec1a3b`.
Phase 2 Reader, AI, Audio and Phase 3A services/routes already exist. No rebuild needed.

| System | Initial audit | Gap |
|---|---|---|
| Supabase | DONE | Env-gated client, web/native persistence |
| Auth | PARTIAL | Restore rejection/races; password recovery completion |
| Profiles | PARTIAL | Missing-row recovery, picker/logout errors |
| Books | PARTIAL | Missing repository methods, explicit publishing |
| Chapters | PARTIAL | Missing mutations and draft deletion |
| Library | PARTIAL | Continue action and safe opt-in merge |
| Reading progress | BROKEN | Debounce starvation, no exit flush, sparse chapter navigation |
| Bookmarks | DONE | Local/cloud action, optimistic rollback |
| Book follows | PARTIAL | Concurrent counter correctness |
| Author follows | PARTIAL | Demo identities and counter correctness |
| Comments | MISSING | Existing UI is demo-only |
| Author onboarding | PARTIAL | Duplicate/retry safety and atomic role promotion |
| Author Studio | PARTIAL | Error retry, complete/draft metrics, publication controls |
| Create book | BROKEN | Could auto-publish; no explicit copyright confirmation |
| Chapter editor | BROKEN | Concurrent inserts, optimistic published state on failed save |
| Cover upload/storage | PARTIAL | Validation, ownership folder and replacement cleanup |
| RLS | PARTIAL | Insert metric spoofing, draft comment visibility and related-row checks |
| DB automation | PARTIAL | Empty publishing and timestamp guards, atomic counters |
| Demo fallback | PARTIAL | Reader fabricated backend fallback; author create route redirects |
| Loading/errors | PARTIAL | Several silent errors and missing-book fallback |
| Route wiring | DONE | Existing requested routes present |
| Type safety | PARTIAL | Typed baseline; mutation contracts need strengthening |

See PROJECT_STATUS.md for final results and remaining manual validation.
