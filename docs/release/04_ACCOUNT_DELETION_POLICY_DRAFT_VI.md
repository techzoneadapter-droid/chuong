# Quy trình và thông báo yêu cầu xóa tài khoản CHƯƠNG

**DỰ THẢO. Đây chưa phải chức năng xóa tài khoản hoặc URL web đang hoạt động.**

Chủ quản: [TÊN PHÁP LÝ]. Kênh yêu cầu: [URL HTTPS XÓA TÀI KHOẢN], [EMAIL HỖ TRỢ]. Hiệu lực: [NGÀY].

## Người dùng có thể làm gì?

Người đã đăng ký CHƯƠNG được gửi yêu cầu xóa tài khoản:
1. Trong ứng dụng: Hồ sơ > Cài đặt > Yêu cầu xóa tài khoản [CODEx CẦN TRIỂN KHAI VÀ KIỂM THỬ].
2. Trên web: truy cập URL HTTPS riêng [CẦN TRIỂN KHAI VÀ KIỂM THỬ], xác minh quyền sở hữu tài khoản an toàn rồi gửi yêu cầu.

Không nên buộc người dùng tải lại ứng dụng chỉ để xóa tài khoản. Không yêu cầu mật khẩu, mã OTP hay giấy tờ cá nhân qua email thường.

## Dữ liệu và tiến trình

Sau khi xác minh, hệ thống đánh dấu yêu cầu; ngăn truy cập trái phép, vô hiệu hóa phiên khi phù hợp và xử lý xóa/khử định danh các dữ liệu không cần lưu giữ (hồ sơ, dữ liệu cá nhân và nội dung liên kết nếu có). Dữ liệu liên quan tranh chấp, nghĩa vụ kế toán/thuế, thanh toán, hoàn tiền, chống gian lận hoặc nghĩa vụ pháp luật có thể phải tiếp tục được lưu trong phạm vi và thời hạn hợp lý, giới hạn người truy cập.

Đối với tài khoản tác giả, phải tách rõ: hồ sơ cá nhân, các tác phẩm do tác giả có quyền xuất bản, nội dung đã được người khác mua và hồ sơ doanh thu. Không được xóa mất quyền lợi người mua hoặc lịch sử đối soát mà không có quy trình thích hợp.

Bản tải offline nằm trên thiết bị có thể cần người dùng tự xóa dữ liệu ứng dụng hoặc gỡ cài đặt. Việc xóa dữ liệu server không tự động xóa toàn bộ tệp đã lưu trên các thiết bị ngắt mạng.

## Thời gian xử lý

Thời gian phản hồi, thời điểm hoàn tất và ngoại lệ lưu giữ: [CHỦ ỨNG DỤNG XÁC NHẬN SAU KHI CODEX HOÀN THIỆN FLOW]. Phải thông báo trạng thái cho người gửi và cung cấp điểm liên hệ khi chưa giải quyết xong.

## Kiểm tra trước khi công bố URL

- Có nút trong app và trang web HTTPS cho người chưa đăng nhập app.
- Xác minh chủ tài khoản: không thể gửi yêu cầu xóa cho người khác.
- Thử với tài khoản test, không dùng người thật trên Production.
- Đã xác định chính xác các bảng/storage/token liên quan.
- Không xóa hồ sơ giao dịch phải giữ vì pháp luật.
- Không lưu mật khẩu/OTP trong request.
- Xử lý email yêu cầu, trạng thái, thất bại/retry, audit log.
- Chính sách riêng tư, Data Safety và URL Play Console đều khớp chức năng thực.

Nguồn chính sách: https://support.google.com/googleplay/android-developer/answer/10144311
