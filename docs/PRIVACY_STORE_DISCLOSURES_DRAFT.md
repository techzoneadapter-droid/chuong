# CHƯƠNG — Privacy / Terms / store disclosures — DRAFT

Ngày: 12/10/2026. Chưa phải cam kết pháp lý hoặc bản khai đã nộp. Chủ sở hữu phải xác nhận pháp nhân, contact, thị trường, độ tuổi, môi trường triển khai và từng SDK trước ký duyệt.

Trang source: `/privacy`, `/terms`, `/delete-account` dùng chung native/web. Chưa có tên miền/URL public được xác minh. Terms chỉ chuyển khỏi DRAFT khi `ugc_policy_versions` có bản đã owner-approved và active; migration không kích hoạt bản nào. Acceptance lấy auth.uid, có version, idempotent; trigger trên authors/books/chapters/comments/book_reviews và Storage profile-avatars/author-avatars/book-covers chặn ghi UGC khi chưa chấp nhận bản active. Service role dùng cho ingestion có quy trình vận hành riêng. Không ghi nhận đồng ý với bản DRAFT. Privacy vẫn cần owner duyệt/publish nội dung riêng.

## Danh mục cần chủ sở hữu xác nhận

| Dữ liệu thấy trong source | Mục đích dự kiến cần xác nhận | Google Data Safety / Apple App Privacy cần xem xét | Xử lý khi xóa |
| --- | --- | --- | --- |
| Email, auth ID, session | Xác thực, recovery | Personal info/contact info/user ID; linked to user | Xóa identity/revoke sessions; thông báo trước khi mất email |
| Username, tên, avatar, bio | Hồ sơ/cộng đồng | Personal info, user content/photos | Xóa/anonymize theo kế hoạch được duyệt |
| Truyện, bản dịch, bìa, bình luận, review | Nội dung người dùng, moderation | User content/photos; public sharing | Rà soát quyền và nghĩa vụ với độc giả; không cascade truyện có giao dịch |
| Kệ sách, tiến độ, bookmark, đọc, follow/block | Đồng bộ Reader, discovery, privacy | App activity/product interaction; linked | Xóa server và cache thiết bị; RLS bảo vệ quyền truy cập |
| Token push, notifications | Gửi thông báo | Device IDs / identifiers theo provider thực tế | Revoke devices, purge queue/provider token |
| Store purchase token/transaction, subscription, wallet/gifts | Xác minh, chống gian lận, đối soát | Purchase history/financial info/identifiers | Giữ ledger theo retention đã phê duyệt; hạn chế truy cập, không xóa tiền tùy ý |
| KYC/thuế/destination tài khoản tác giả | Thanh toán tác giả | Financial/payment info + personal info | Quyết định legal hold/retention riêng; không public/log |
| Ads identifiers, SDK diagnostics/consent | Quảng cáo, consent | Device ID/advertising data/diagnostics; tracking phải đánh giá | UMP options; cấu hình audience/ATT cần kiểm thử native |
| Text/image tới AI và OS TTS | Dịch/bìa/đọc tiếng Việt | User content/third-party collection theo deployment | Xác nhận provider, vùng xử lý và retention; không cam kết offline |

Không tick “không thu thập”, “không chia sẻ”, “không tracking”, “dữ liệu đã mã hóa end-to-end” chỉ từ code. Đối chiếu Supabase, Expo push, Google Mobile Ads/UMP, Apple/Google stores, AI provider và PrivacyInfo.xcprivacy của exact binary. Data Safety phải bao gồm SDK, collection ephemeral và các lựa chọn optional/required theo hoạt động thật. Apple linked/tracking phải xác nhận từ cấu hình AdMob/IDFA/ATT thực tế.

## Nội dung còn phải điền trước public

- Pháp nhân/chủ thể dữ liệu, địa chỉ liên hệ privacy/support/copyright và URL HTTPS public.
- Căn cứ/mục đích xử lý, recipients/subprocessors, quốc gia, retention từng lớp và legal hold.
- Deletion SLA/nhân sự, cách gửi và xác minh yêu cầu, thông báo hoàn tất, appeal/access/correction.
- Audience/độ tuổi, parental process nếu áp dụng; không mặc định app dành cho trẻ em chỉ vì dùng học lập trình.
- Quy tắc UGC/prohibited content, licensing, report/block/moderation/appeal; terms acceptance trước upload storage.
- Điều kiện VIP/Linh Thạch, store subscriptions/refunds và payout theo tư vấn pháp lý; không tự hứa hoàn lại số dư.

## Hồ sơ quyền truyện / bìa — DRAFT

Tạo một hồ sơ cho mỗi book ID trước listing public: title, author ID, chủ quyền, nguồn/file ZIP và checksum, hợp đồng/chứng cứ + nơi lưu có ACL, quyền tác phẩm gốc/bản dịch/ảnh bìa, phạm vi nền tảng/quốc gia/thời gian, ngày hết hạn, quyền monetization/phân phối/offline/TTS, người rà soát, ngày duyệt, takedown/appeal ID. Nhãn `original`, `licensed_translation`, `authorized` hoặc tick cam kết không chứng minh quyền. Không đưa hợp đồng/PII vào public metadata.

Admin reports/list/detail đã có; dùng copyright/plagiarism + hide/reject/restore có moderation log. Phase 4B không tạo UI báo cáo trùng và không đánh dấu catalog có quyền khi chưa thấy tài liệu. Imported ZIP/AI covers cần kiểm kê riêng. H6 còn mở cho quyền nội dung thực tế.
