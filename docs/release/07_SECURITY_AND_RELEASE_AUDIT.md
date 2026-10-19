# CHƯƠNG — Kiểm định GitHub/Supabase ngày 19/10/2026

**Phạm vi:** kiểm tra mã nguồn và CI từ GitHub, truy vấn Supabase production chế độ chỉ đọc. Không có quyền kết luận build APK/AAB Android trên thiết bị vì chưa chạy native QA. Dữ liệu hệ thống có thể thay đổi liên tục.

## Tham chiếu kiểm tra

- Repo: https://github.com/techzoneadapter-droid/chuong
- Main được khảo sát: b107ca1007fbc2ade4dc7078db5e960b828acb3c
- Main CI tương ứng: https://github.com/techzoneadapter-droid/chuong/actions/runs/39214393719 (web-check và browser-smoke thành công).
- PR độc lập AdMob/SSV đang mở, trạng thái draft tại thời điểm kiểm tra: https://github.com/techzoneadapter-droid/chuong/pull/5 — **không đồng nghĩa sửa lỗi này đã có trên main**.
- PR reader/performance: https://github.com/techzoneadapter-droid/chuong/pull/3 — chưa xem là đã merge.

## Snapshot production

| Hạng mục | Kết quả |
|---|---:|
| Truyện public | 1.170 |
| Chương published | 31.288 |
| Bảng public bật RLS | 54 / 54 |
| Truyện thiếu đường dẫn ảnh bìa | 1 |
| Truyện có mô tả dưới 40 ký tự hoặc trống | 1.166 |
| Nhóm (book_id,chapter_number) trùng | 0 |
| Bản ghi store purchases | 0 |
| Bản ghi account subscriptions | 0 |

**Chú ý:** mô tả ngắn không phải lỗi chính sách tự động; nên kiểm tra chất lượng/khả năng hiển thị chứ không tự sửa hàng loạt. Các số trên là số truy vấn tại thời điểm kiểm tra, không dùng làm doanh thu hoặc cam kết kho truyện cố định.

## Supabase Security Advisor

- 8 trường hợp WARNING: anonymous users có quyền EXECUTE một số hàm SECURITY DEFINER.
- 58 trường hợp WARNING: authenticated users có quyền EXECUTE hàm SECURITY DEFINER.
- 2 INFO: RLS enabled but no policies tại các bảng private. Không tự coi là lỗ hổng, cần xác định ý đồ giới hạn quyền.
- 1 WARNING: leaked-password protection trong Supabase Auth cần chủ dự án kiểm tra và cân nhắc bật theo hỗ trợ/gói.

Các số trên là advisory, không phải 67 lỗ hổng đã xác nhận. Phải soát từng hàm, hàm đọc công khai, guard auth.uid(), auth role, kết quả trả về, schema private/exposed và quyền EXECUTE. Một số hàm admin được kiểm tra thủ công có guard private.is_admin(), nên không tự ý chuyển toàn bộ hàm thành SECURITY INVOKER.

Tham chiếu:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Các P0 có cơ sở kiểm tra trên main

1. **Account deletion:** chưa thấy luồng chính thức trong app + URL web công khai theo tiêu chuẩn Google Play.
2. **Privacy/Terms:** chưa thấy chính sách công khai hoàn chỉnh có đủ email, chủ dịch vụ, retention và đường dẫn HTTPS.
3. **Rewarded ads:** services/rewards.ts gọi RPC claim_rewarded_ad_bonus() sau callback client; trong hàm RPC production đã kiểm tra trước đó, thao tác cộng thưởng chủ yếu phụ thuộc auth.uid() và lượt nhận trong ngày, chưa thấy xác minh chữ ký SSV trước cộng. PR #5 có nêu SSV nhưng đang nháp, cần review/kiểm thử và xác nhận migration runtime đã triển khai trước khi coi là đã fix.
4. **Billing production:** app có expo-iap, 4 store product IDs và 1 VIP product ID trong tài liệu; 0 giao dịch production được ghi nhận. Không kết luận IAP hoạt động khi chưa kiểm thử sandbox/internal Play.
5. **AdMob:** app.config.js có test app ID fallback, phải chặn fallback này cho release khi không có cấu hình thật. PR #5 có thể thay đổi logic nên kiểm tra sau khi merge.
6. **Android native:** chưa có AAB đã ký, manifest cuối cùng, 16 KB page compatibility hay kết quả QA máy thật để xác thực.
7. **Privacy/Data Safety:** phải kiểm tra SDK quảng cáo, analytics, AI, push và chính xác các loại dữ liệu khai báo.

## Các P1 cần người làm app xem tiếp

- Nhận diện giọng TTS phụ thuộc voice pack hệ thống; giọng nam/nữ có thể dùng pitch thay thế khi chỉ có một giọng vi-VN, không nên quảng bá là hai giọng thật được bảo đảm.
- app.config.js và cấu hình EAS cần giá trị project ID thật cho push/build.
- Doanh thu tác giả: cần xác minh logic hoàn tiền, thanh toán và retention hồ sơ khi người dùng xóa tài khoản.
- Kho truyện quy mô trên 30k chương cần smoke test đọc dài, pagination, offline, memory, CPU, download và tác vụ chuyển chương.
- Nội dung nguồn: chủ ứng dụng xác nhận là tự sáng tác hoặc nguồn miễn phí công khai; không tự gỡ/ẩn hàng loạt. Với nội dung bên ngoài, cần giữ được căn cứ cho quyền phân phối, vì miễn phí đọc không luôn đồng nghĩa quyền tái bản.

## Kết luận

Main CI xanh là PASS cho TypeScript/web tests tại commit kiểm tra, **không chứng minh đạt Play Production**. Hồ sơ pháp lý trong nhánh này chưa xuất bản; Codex cần hoàn thiện các flow và người phát hành phải xác nhận/cấu hình thủ công. Không thực hiện bất kỳ chỉnh sửa DB production nào trong cuộc kiểm định.
