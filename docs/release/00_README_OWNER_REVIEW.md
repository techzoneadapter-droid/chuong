# CHƯƠNG — Hồ sơ phát hành Google Play (BẢN NHÁP)

Kiểm tra: 19/10/2026. Căn cứ mã nguồn main tại b107ca1007fbc2ade4dc7078db5e960b828acb3c và truy vấn Supabase chỉ đọc.

**Mục đích:** hồ sơ dự thảo để chủ ứng dụng duyệt, Codex tích hợp và Play Console sử dụng sau khi kiểm chứng bản AAB thực tế. Tài liệu này KHÔNG phải sự chứng nhận pháp lý, KHÔNG phải bằng chứng Google duyệt và KHÔNG tự động xuất bản.

## Trạng thái và nguyên tắc tích hợp

- Nhánh tài liệu này không sửa runtime, database hoặc hồ sơ doanh thu. Không tự merge vào main khi Codex đang làm nhánh khác.
- Tất cả ô [CẦN CHỦ ỨNG DỤNG XÁC NHẬN] bắt buộc được điền/duyệt trước khi hiển thị tài liệu ra công chúng.
- Tài liệu pháp lý phải khớp chính xác ứng dụng thực tế sau khi Codex sửa xong, đặc biệt xóa tài khoản, quảng cáo, thanh toán, AI, lưu trữ và đối tác nhận dữ liệu.
- Chính sách quyền riêng tư và xóa tài khoản cần URL HTTPS công khai hoạt động; một tài liệu Markdown trong GitHub chưa đáp ứng điều này.
- Chỉ tính PASS nếu kiểm thử thực tế có bằng chứng. Có code không đồng nghĩa đã phát hành.
- Play Console và các khóa bí mật do chủ tài khoản cấu hình trực tiếp, không cung cấp qua chat hoặc commit Git.

## Tệp trong bộ này

1. 01_PRIVACY_POLICY_DRAFT_VI.md — dự thảo chính sách bảo mật.
2. 02_TERMS_OF_USE_DRAFT_VI.md — điều khoản độc giả, VIP, thanh toán.
3. 03_CREATOR_UGC_POLICY_DRAFT_VI.md — tác giả, nội dung và khiếu nại.
4. 04_ACCOUNT_DELETION_POLICY_DRAFT_VI.md — quy tắc xóa tài khoản.
5. 05_GOOGLE_PLAY_LISTING_VI.md — mô tả cửa hàng, ảnh và reviewer.
6. 06_DATA_SAFETY_WORKSHEET_VI.md — ma trận dữ liệu cần điền Play Console.
7. 07_SECURITY_AND_RELEASE_AUDIT.md — kết quả kiểm tra thực tế, rủi ro.
8. 08_OWNER_HANDOFF_CHECKLIST.md — việc của chủ ứng dụng còn lại.

## Thông tin phải được xác nhận trước khi công khai

- [ ] Chủ thể cung cấp dịch vụ chính xác: tên pháp lý; địa chỉ liên hệ và địa chỉ nhận yêu cầu dữ liệu. Không mặc định tên công ty dựa trên tài khoản GitHub.
- [ ] Email hỗ trợ và email dành cho yêu cầu xóa tài khoản/vi phạm bản quyền (có người tiếp nhận).
- [ ] Địa chỉ URL HTTPS chính thức cho website, Chính sách riêng tư, Điều khoản, Xóa tài khoản.
- [ ] Thời điểm chính sách bắt đầu áp dụng và chu kỳ/ngoại lệ lưu giữ dữ liệu sau khi xóa.
- [ ] Đối tác xử lý dữ liệu thực tế và khu vực xử lý; kiểm tra ràng buộc bảo vệ dữ liệu áp dụng.
- [ ] Giới hạn độ tuổi/khả năng tiếp cận nội dung do người dùng tạo và mô tả cơ chế kiểm duyệt.
- [ ] Giá, lợi ích, quy tắc dùng VIP/Linh Thạch đúng theo bản phát hành thực.
- [ ] Đường dẫn hỗ trợ trong app và Google Play hoạt động; Play Data Safety khớp SDK của file AAB cuối.

## Nguồn chính sách Google

- User Data / privacy and account deletion: https://support.google.com/googleplay/android-developer/answer/10144311
- Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Listing images: https://support.google.com/googleplay/android-developer/answer/9866151
- Target API 2026: https://support.google.com/googleplay/android-developer/answer/11926878
