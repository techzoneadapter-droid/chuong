# Kiểm chứng tối ưu hiệu năng — 17/10/2026

## Thay đổi

- Trang chủ hiển thị danh mục ngay khi dữ liệu chính sẵn sàng; xếp hạng, đề xuất và tiến độ tải độc lập. Giữ nội dung khi quay lại cùng tài khoản, bỏ kết quả của màn hình đã rời.
- Chi tiết truyện không phải chờ quà tặng, thư viện hoặc truyện liên quan; truy vấn liên quan có giới hạn thay vì tải toàn kho.
- Gộp các GET/HEAD đang chạy có cùng URL và header; tách tài khoản, phân trang và quyền truy cập. Không lưu phản hồi đã hoàn tất, không gộp giao dịch ghi.
- Gộp tiến độ thư viện theo lô, chia sẻ dữ liệu sách giữa các bảng xếp hạng; giới hạn phần tử hiển thị trong các danh sách dài.
- Metadata chương có thời hạn, nội dung trong bộ nhớ có giới hạn; quyền đọc vẫn kiểm tra lại từ máy chủ. Không dùng cache để vượt khóa VIP.
- Giảm cập nhật state khi vuốt, xử lý văn bản/TTS theo từng đợt để nhường luồng JS, chỉ tìm giọng đọc khi cần; đồng bộ tiến độ và offline ở nền.
- Ảnh nền được memo hóa và giải mã theo kích thước hiển thị. Diagnostics chỉ chạy khi phát triển trên web.

## Bằng chứng kiểm thử

- TypeScript và năm bộ kiểm thử hiệu năng đạt.
- Fixture thư viện 205 sách: 3 truy vấn tiến độ, 2 lần đọc cache, 1 lần ghi cache.
- Fixture 1.201 chương: mở/tiếp/lùi dùng 3 truy vấn metadata thay vì 9; quyền nội dung vẫn được kiểm tra mới.
- Fixture vuốt: 200 sự kiện di chuyển chỉ cần 3 lần cập nhật phản hồi state.
- Web: lượt 40 bài có 36 đạt và 4 lỗi vuốt; sau sửa, cả 4 bài lỗi đều đạt. Thêm 8 bài demo/ảnh/danh sách lớn đạt. Thời gian fixture web không phải benchmark Android.
- Build Android release ARMv7 thành công; cập nhật bằng adb install -r thành công, giữ dữ liệu ứng dụng.
- Samsung SM-T385K, Android 9: mở trang chủ có dữ liệu thật, đọc chương 1, mở chương 2 và cuộn nội dung. Bản release hoạt động độc lập với Metro.
- Android gfxinfo trong lượt cuộn ngắn: 121 frames, 1 janky (0,83%), p50 11 ms, p95 12 ms, p99 15 ms. Không có baseline cùng kịch bản để kết luận phần trăm cải thiện. Lượt này không đại diện cho mọi màn hình hay mọi thiết bị.

## APK và giới hạn

APK: `.cache/artifacts/chuong-performance-release-armv7.apk`, 45.589.033 bytes.
SHA-256: `7DD0E7874D17DC6E5B780C12E50B24CC16B23D9C349BB53B82387EA17A096AD6`.
Đây là bản cài nội bộ, chưa phải bản ký phát hành Google Play; quảng cáo thật vẫn tắt.

Bản development có thời điểm màn trống và Logcat báo mất kết nối Metro; chưa xác định đầy đủ nguyên nhân của trạng thái development đó. Không dùng số đo development để tuyên bố tốc độ bản release.
Chưa xác nhận trực tiếp toàn bộ hành trình tài khoản, thanh toán, thưởng, TTS phát âm và offline trên Samsung sau tối ưu. Các kiểm thử tự động không thay thế hoàn toàn nghiệm thu các luồng đó. Không sửa dữ liệu production, không triển khai SQL hoặc kích hoạt thanh toán/quảng cáo thật.

Log và bằng chứng cục bộ trong `.cache/artifacts/performance-release*`; log toàn bộ verify tại `.cache/performance-final-verify.log`.

Kiểm tra bổ sung: tab Khám phá hiển thị dữ liệu thật và bộ lọc; tab Thư viện hiển thị tủ sách. Android am start -W sau force-stop ghi nhận TotalTime 923 ms; đây là thời gian Activity, không phải thời gian tải xong dữ liệu.


Kiểm tra cuối: npm run verify hoàn tất với exit code 0, bao gồm TypeScript, hiệu năng, UI copy, admin syntax, 712 kiểm tra release, các bộ database/economy/AdMob và xuất web production. Còn cảnh báo cấu hình EAS projectId cần chủ dự án thiết lập trước phát hành.
