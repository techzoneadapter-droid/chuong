# CHƯƠNG — Admin Catalog / Tàng Kinh Các

The admin catalog is the platform-owned ingestion path for expanding CHƯƠNG beyond the initial seed catalog.

## What admins can do

From **Trung tâm quản trị → Tàng Kinh Các · Kho truyện**, an admin can:

- see the full catalog, including private drafts
- create a new story
- choose the internal owner author
- set a separate public author credit
- declare the content source: original, licensed translation, or authorized distribution
- upload or replace a 2:3 cover
- assign genre and tags
- paste/import many chapters in one operation
- import chapters as drafts or publish them immediately
- change a story between private / ongoing / completed / paused
- delete a draft story

## Ownership versus public credit

`books.author_id` remains the internal ownership and security principal. It controls author access and downstream revenue ownership.

`books.credited_author_name` is optional display metadata. It lets the catalog accurately credit a public author name without pretending that the admin account authored the work.

For platform-owned originals, use **CHƯƠNG Studio** as the internal owner. For a real participating author, select that author so ownership/revenue remain attached to the correct account.

## Bulk chapter format

Paste chapters using headings such as:

```text
### Chương 1: Khai Môn
Nội dung chương 1...

### Chương 2: Linh Căn
Nội dung chương 2...
```

The importer detects chapter number, title and content. It refuses duplicate chapter numbers and refuses publishing chapters shorter than the existing publication minimum.

## Publication safety

A newly created catalog story always starts as `draft` + `private`. A story cannot be made public until at least one chapter has been published.

The admin flow does not scrape or copy third-party novels automatically. Before importing material, the admin must confirm CHƯƠNG has the right to store and distribute that content.

## Cover behavior

Uploaded covers are stored in the existing public `book-covers` bucket. Admin uploads use the admin user's storage folder plus the target book ID, while database ownership can remain attached to a different author.

The same `cover_url` is used by Home, Discover / Tàng Kinh Các, Library / Tủ Linh Thư, book detail and admin catalog.

If a story has no uploaded cover, the app now renders a xianxia-style procedural fallback instead of a plain color block.

## Database hardening

Phase 4M adds `books.credited_author_name`, admin INSERT policies for books/chapters, admin draft-delete policies, admin genre management, admin catalog cover uploads, and credited-author search indexing through `books.search_text`.

RLS remains enabled; ordinary readers/authors do not inherit admin catalog permissions.
