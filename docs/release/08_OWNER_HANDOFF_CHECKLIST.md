# CHƯƠNG — Việc của chủ phát hành sau khi nhận bản kỹ thuật

Ngày rà soát: 19/10/2026. Người dùng xác nhận đã hoàn tất 3 việc đầu: đăng ký/xác minh Play Developer, chủ thể phát hành và hồ sơ thanh toán/thuế. **Không yêu cầu làm lại** các bước này trừ khi Play Console thông báo thiếu.

## Chưa thể tự làm chỉ bằng mã nguồn

| Mục | Việc cần thực hiện trong tài khoản chính chủ | Khi nào |
|---|---|---|
| 4 | Tạo/kiểm tra app CHƯƠNG, package vn.chuong.app trong Google Play Console | Trước khi tải AAB |
| 5 | Tạo app và đơn vị quảng cáo AdMob, nhập real IDs và cấu hình UMP | Khi bật quảng cáo |
| 6 | Tạo 4 gói Linh Thạch + subscription chuong.vip.monthly, giá VND, tester | Khi bật thanh toán |
| 7 | Cấp API cho Google Play Developer, Pub/Sub RTDN, các secrets cần thiết | Khi bật thanh toán |
| 8 | Xác nhận tên pháp lý, địa chỉ, email hỗ trợ, chính sách riêng tư, điều khoản, retention và URL HTTPS | Trước Store Listing/Data Safety |
| 9 | Hoàn thành App Content, Data Safety, Content Rating, Target Audience, Ads, App Access, screenshot/feature graphic | Trước Closed/Production |
| 10 | Cài Internal Test từ Google Play, dùng Android thật, cung cấp tester (nếu áp dụng) và quyết định phát hành | Trước Production |

## 6 thông tin cần chủ ứng dụng cung cấp khi đến giai đoạn duyệt hồ sơ

1. Tên pháp lý chính xác muốn hiển thị ở Chính sách quyền riêng tư/Điều khoản.
2. Email hỗ trợ khách hàng và email tiếp nhận yêu cầu xóa tài khoản/bản quyền.
3. Website chính thức cùng đường dẫn HTTPS có thể công bố.
4. Phương án tiếp nhận và thời hạn xử lý xóa tài khoản; ngoại lệ retention tài chính/thuế.
5. Nhóm tuổi mục tiêu và quy tắc nội dung cần kiểm duyệt.
6. Quy tắc giá, thời hạn, điều kiện hoàn tiền, rút doanh thu tác giả đúng sản phẩm thực tế.

## Không gửi cho người hỗ trợ hoặc commit Git

- Mật khẩu Google Play Console
- OTP/khóa bảo mật
- JSON private key của service account
- Supabase service role/secret keys
- Tài khoản ngân hàng đầy đủ, CCCD cá nhân
- Mã phiên đăng nhập/tester mật khẩu trong file công khai

## Cách phối hợp Codex

- Codex làm code/CI/native tests và tích hợp URL thật sau khi chủ duyệt.
- Nhánh tài liệu pháp lý này chỉ chứa dự thảo, không thay đổi app runtime.
- Trước khi merge main: đối chiếu PR AdMob, PR reader, migration, Data Safety và các trang policy. Tránh xung đột trên cùng tệp.
- Chỉ khi có bản AAB và kiểm thử trên Google Play Internal Testing mới đánh dấu native billing / ads / push PASS.

## Play reference

- Developer policy account deletion: https://support.google.com/googleplay/android-developer/answer/10144311
- Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Target SDK 36 for new apps from Aug 31 2026: https://support.google.com/googleplay/android-developer/answer/11926878
