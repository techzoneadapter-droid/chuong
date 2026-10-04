# CHƯƠNG — Premium AI upload translation

AI is intentionally **not a reader feature**.

The reader toolbar contains only chapter navigation, appearance, read-aloud and more actions. The old reader-facing AI routes and demo conversion service were removed.

## Where AI lives

AI appears only in the author upload/import workflow:

`Author Studio → Book → Tải truyện / AI dịch`

Supported input:

- TXT
- DOCX
- ZIP
- pasted full-story / multi-chapter convert text

The normal upload path is free. The **AI dịch / làm mượt toàn truyện** option requires an active CHƯƠNG Premium entitlement. Admin accounts are treated as Premium for operations/testing.

## Translation behavior

The AI worker processes the entire uploaded book chapter by chapter.

For every chapter it:

- detects whether the source is another language or rough Vietnamese convert text
- translates/rewrites into natural Vietnamese
- follows the book genre when choosing narrative tone
- preserves names, cultivation realms, techniques, locations, honorifics and terminology
- preserves paragraph structure
- does not summarize or omit content
- does not invent plot
- splits long chapters into bounded chunks and rejoins them
- stores an original + translated revision before the result is considered complete
- keeps imported AI-processed chapters as drafts for human review before publication

Progress is durable. Each translated chapter creates a revision row, so retries derive progress from stored revisions instead of blindly incrementing a client counter.

## Premium enforcement

Premium is checked twice:

1. the upload UI hides/locks the AI option for non-Premium accounts
2. the Supabase Edge Function checks Premium again before starting or continuing a job

This prevents a Free user from bypassing the UI and calling the translation endpoint directly.

Premium state lives in `account_subscriptions`. The server-only function `has_active_premium(uuid)` is executable only by the service role. Client apps do not receive a callable arbitrary-user Premium lookup.

## AI provider configuration

The Edge Function is provider-agnostic for OpenAI-compatible chat-completions endpoints.

Required Supabase function secrets:

- `AI_TRANSLATE_API_KEY` (or `OPENAI_API_KEY`)
- `AI_TRANSLATE_MODEL`

Optional:

- `AI_TRANSLATE_BASE_URL` — defaults to `https://api.openai.com/v1`
- `AI_TRANSLATE_PROVIDER` — display/audit label

If the provider is not configured, upload still works normally; only the Premium AI switch is unavailable.

## Data model

- `account_subscriptions` — paid Premium state
- `ai_translation_jobs` — whole-book progress/status
- `ai_translation_revisions` — original and translated chapter revision pairs

The deployed function is:

- `ai-translate-book`

Actions:

- `status` — Premium/provider readiness
- `start` — creates a whole-book translation job
- `step` — processes the next untranslated chapter

The client repeatedly calls `step`, which avoids trying to translate a large novel inside one Edge Function request.
