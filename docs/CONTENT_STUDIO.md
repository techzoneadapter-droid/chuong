# CHƯƠNG Content Studio

Content Studio is the browser-first management app for the mobile CHƯƠNG catalog.

## Entry points

- `/studio/login` — dedicated Admin sign-in
- `/studio` — catalog dashboard
- `/studio/upload` — bulk upload/import
- `/studio/book/[bookId]` — manage one book
- `/studio/book/[bookId]/chapter/[chapterId]` — create/edit one chapter

Only accounts whose profile role is `admin` can use the Studio. Data is written to the same production Supabase tables/storage used by the mobile app, so there is no second catalog to synchronize.

## What the Studio can do

### Catalog dashboard

- search by title, author, genre and tag
- filter by draft / ongoing / completed / paused
- see book, publication and chapter totals
- jump directly to a book manager
- preview the reader-facing book route

### Bulk upload

- TXT
- DOCX
- ZIP
- pasted multi-chapter text
- multiple books grouped by ZIP folders
- optional cover image inside ZIP
- choose internal owner author
- choose displayed author credit
- choose genre / language / source rights
- preview detected books/chapters before write
- keep as drafts or publish eligible chapters

### Book management

- title
- displayed author
- description
- genre
- tags
- language
- source/rights type
- uploaded cover
- book lifecycle status
- bulk append chapters
- publish/hide individual chapters
- open chapter editor

### Chapter editor

- create new chapter
- edit chapter number/title/body
- live word/character/paragraph counts
- free/VIP access
- Linh Thạch price for VIP chapters
- save draft
- publish
- delete draft chapter

## Security

The Studio is not trusted merely because it is a web route.

- client gate requires `profile.role = admin`
- catalog services re-check the signed-in profile role
- Supabase RLS/admin policies remain the real authorization boundary
- draft/private content stays hidden from public mobile readers
- uploaded book covers use the same storage policies as the app

## UI copy rule

Runtime UI source must not contain Han/CJK characters. `npm run test:ui-copy` scans app/components/constants/data/hooks/services and fails CI if characters from the Han Unicode ranges are committed.

This rule is about application UI/source copy. User-uploaded story content is not rewritten or blocked merely because the story itself contains another language.
