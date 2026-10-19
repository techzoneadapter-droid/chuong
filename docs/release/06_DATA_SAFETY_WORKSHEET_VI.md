# CHƯƠNG — Bảng đối chiếu Google Play Data Safety

**BẢN CÔNG TÁC, KHÔNG PHẢI BIỂU MẪU ĐÃ NỘP.** Đối chiếu source main ngày 19/10/2026 và cần đối chiếu SDK + network thực tế trên Android AAB cuối.

Chú ý: Google coi dữ liệu được **gửi khỏi thiết bị qua SDK** là được thu thập, kể cả khi nhà phát triển không đọc trực tiếp. Đánh dấu "xem xét" không có nghĩa dữ liệu chắc chắn được thu thập/chia sẻ. Quyết định khai báo cuối cùng thuộc chủ app trên cơ sở dữ liệu thực tế.

| Dữ liệu / loại cần xem xét | Dòng dữ liệu thấy từ code | Mục đích có thể áp dụng | Xác minh trước Play |
|---|---|---|---|
| Email và ID tài khoản | Supabase Auth đăng ký, đăng nhập, phiên | Quản lý tài khoản, bảo mật | Xác minh email có thu thập, có bắt buộc |
| Tên hiển thị/bút danh/bio/avatar | profiles, authors, image picker/storage | Hồ sơ, tương tác, xuất bản | Xác định công khai/riêng tư, có chia sẻ với người dùng khác |
| Nội dung UGC | book, chapter, comment, review, reports | Tính năng ứng dụng, kiểm duyệt | Xem danh mục "Messages/Other user-generated content" phù hợp |
| Hành vi ứng dụng | reading progress, engagements, bookmarks, user actions | Cá nhân hóa, phân tích app | Kiểm tra cài đặt lưu/đồng bộ và độ nhạy |
| ID thiết bị/ID cài đặt | local analytics install ID, notification device key, push token | Analytics, thông báo và chống lỗi | Kiểm tra có gửi đến backend/bên thứ ba |
| Mã quảng cáo, interactions | Google Mobile Ads, UMP SDK | Quảng cáo/đo lường/chống gian lận | Xem Data Safety của phiên bản SDK thực, consent và sharing |
| Giao dịch / purchase IDs | Google Play Billing, purchases, subscriptions | Mua hàng, đối soát, chống gian lận | Xem trường có chứa dữ liệu tài chính cá nhân; không tuyên bố app lưu số thẻ nếu không |
| Thu nhập, rút tiền tác giả | revenue ledger, payout profile/workflow | Thanh toán cho tác giả | Kiểm tra trường tài khoản ngân hàng/KYC có phát sinh thực tế không |
| Hình ảnh/tệp người dùng chọn | avatar, cover imports | Upload ảnh đại diện, bìa | Chỉ khai dữ liệu thực được gửi/lưu; không tự đồng nhất quyền thư viện với thu thập mọi ảnh |
| Dữ liệu kỹ thuật | backend/web server logs, SDK device info | Vận hành và bảo mật | Dựa trên config nhà cung cấp, log thực và telemetry |
| Vị trí | Không thấy tính năng GPS trong source được khảo sát | — | Không khẳng định thu thập vị trí chính xác khi không có, nhưng kiểm tra SDK ads suy luận vị trí gần đúng |
| Âm thanh TTS | expo-speech dùng engine thiết bị | Đọc thành tiếng | Kiểm tra engine và SDK thực, không tự suy luận app tải âm thanh của người dùng |
| Dữ liệu AI | luồng ai-translate-book / ai-generate-cover | Biên tập, tạo bìa theo thao tác | Xác định prompt/đoạn truyện được gửi đến provider nào, cơ sở xử lý/consent |

## Các câu hỏi phải trả lời trong Play Console

- Ứng dụng có thu thập/chia sẻ dữ liệu không? Cần đánh giá cả SDK quảng cáo, đăng nhập và hệ thống bên thứ ba.
- Mỗi loại dữ liệu: thu thập hay chia sẻ, có bắt buộc không, sử dụng cho mục đích gì, có tạm thời không?
- Dữ liệu được mã hóa khi truyền? Phải xác minh HTTPS/TLS thực tế toàn bộ luồng.
- Người dùng có thể yêu cầu xóa dữ liệu? Phải có đường dẫn xóa tài khoản hoạt động và quy tắc lưu giữ.
- Có chức năng quảng cáo? Có thông tin bổ sung cần khai báo trong "App content"?
- Ứng dụng dành cho nhóm tuổi nào, có nội dung do người dùng tạo và nội dung người lớn không?
- Có SDK bên thứ ba hoặc provider AI mới thêm khi Codex cập nhật không? Phải kiểm toán lại ở commit phát hành.

## Căn cứ từ mã nguồn đã khảo sát

- services/auth.ts: email, password + display name, profile.
- lib/supabase.ts: Supabase, persisted session.
- services/analytics.ts: mã cài đặt và đo phiên đọc.
- services/pushNotifications.ts: device key/push token.
- services/offlineDownloads.ts: cache/tải offline tại thiết bị.
- services/moderation.ts: reports/UGC.
- components/AdsBridge.native.tsx và AdBanner.native.tsx: AdMob/consent.
- hooks/useLinhThachIap.native.ts, usePremiumIap.native.ts: native store purchases.
- services/payouts.ts: tác giả, đề nghị đối soát/rút.

## Chặn nộp Data Safety khi

1. Chưa có chính sách riêng tư HTTPS công khai.
2. Chưa có đường xóa tài khoản đúng yêu cầu hoặc policy không nói rõ ngoại lệ retention.
3. SDK/permissions trên AAB cuối khác với bảng khai.
4. Không biết hành vi thu thập của AdMob/SDK nhận dạng thiết bị, AI provider hay push.
5. Chưa chạy thử luồng UGC/paid features trong bản cung cấp tester.

Nguồn chính: https://support.google.com/googleplay/android-developer/answer/10787469
