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
- bulk import TXT, DOCX or ZIP from the Web Admin
- preview detected books/chapters before database writes
- auto-detect a cover image placed beside a book inside a ZIP folder when available
- import chapters as drafts or publish them immediately
- change a story between private / ongoing / completed / paused
- delete a draft story

## Ownership versus public credit

`books.author_id` remains the internal ownership and security principal. It controls author access and downstream revenue ownership.

`books.credited_author_name` is optional display metadata. It lets the catalog accurately credit a public author name without pretending that the admin account authored the work.

For platform-owned originals, use **CHƯƠNG Studio** as the internal owner. For a real participating author, select that author so ownership/revenue remain attached to the correct account.

## Bulk chapter format

For a single book, paste text or import a TXT/DOCX file using headings such as:

```text
### Chương 1: Khai Môn
Nội dung chương 1...

### Chương 2: Linh Căn
Nội dung chương 2...
```

The importer detects chapter number, title and content. ZIP import can group multiple books by top-level folder and can treat multiple chapter files in the same folder as one book. The preview lets the admin rename/disable candidates before importing. It refuses duplicate chapter numbers and refuses publishing chapters shorter than the existing publication minimum.

## Publication safety

A newly created catalog story always starts as `draft` + `private`. A story cannot be made public until at least one chapter has been published.

The admin flow does not scrape or copy third-party novels automatically. Before importing material, the admin must confirm CHƯƠNG has the right to store and distribute that content.

## Cover behavior

Uploaded covers are stored in the existing public `book-covers` bucket. Admin uploads use the admin user's storage folder plus the target book ID, while database ownership can remain attached to a different author.

The same `cover_url` is used by Home, Discover / Tàng Kinh Các, Library / Tủ Linh Thư, book detail and admin catalog.

If a story has no uploaded cover, the app shows a neutral **Chưa có bìa** state. Decorative/demo book covers are never substituted for real catalog covers.

## Database hardening

Phase 4M adds `books.credited_author_name`, admin INSERT policies for books/chapters, admin draft-delete policies, admin genre management, admin catalog cover uploads, and credited-author search indexing through `books.search_text`.

RLS remains enabled; ordinary readers/authors do not inherit admin catalog permissions.


## Web Admin — Quản trị kho truyện

Trang GitHub Pages Admin Upload Studio có thêm tab **Quản trị kho truyện** dành riêng cho Admin:

- tìm theo tên truyện và tác giả hiển thị
- lọc theo thể loại và trạng thái
- sắp xếp theo top lượt xem, lượt theo dõi, số chương hoặc thời gian cập nhật
- sửa tên truyện, tác giả hiển thị, thể loại, trạng thái và mô tả
- mở từng chương để sửa tiêu đề, trạng thái và toàn bộ nội dung
- thêm/thay bìa thủ công
- tạo bìa AI 2:3 (1024 × 1536) từ tên truyện + thể loại
- chọn nhiều truyện để chỉnh tác giả/thể loại/trạng thái hàng loạt
- tạo bìa AI hàng loạt, mặc định bỏ qua truyện đã có bìa
- xóa hàng loạt với xác nhận rõ ràng

AI cover API key chỉ được giữ trong `sessionStorage` của phiên trình duyệt và được gửi tới Edge Function đã xác thực Admin cho từng lần tạo ảnh; key không được ghi vào Git hoặc database.

Xóa vĩnh viễn được chặn đối với truyện đã có lịch sử giao dịch, entitlement, doanh thu hoặc quà tặng để tránh phá dữ liệu tài chính. Các truyện như vậy nên được chuyển về **Riêng tư** thay vì hard-delete.
