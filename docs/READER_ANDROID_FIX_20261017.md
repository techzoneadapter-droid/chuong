# Trình đọc CHƯƠNG Android — 17/10/2026

## Nguyên nhân và cách sửa

Luồng thống nhất: nút/vuốt/chọn chương → requestedChapter cục bộ → metadata → RPC kiểm tra quyền → nội dung hoặc paywall → lưu tiến độ nền. URL phản ánh trạng thái, không còn là điều kiện duy nhất để bắt đầu tải chương.

1. Chế độ page có hai responder khác nhau: bật vuốt chương thì bỏ qua các trang, tắt thì không vượt được ranh giới chương. Nay cùng một responder lật từng trang trước, chỉ đổi chương ở ranh giới; cuộn dọc không bị nhận nhầm.
2. scrollEnabled=false khiến đoạn dài vượt chiều cao trang không thể đọc hết. Nay phần tràn vẫn cuộn được.
3. Mỗi lần chuyển chương tháo toàn bộ ScrollView/banner rồi dựng lại. Nay giữ view và node đoạn văn, có lớp tải chặn cảm ứng, ẩn nội dung đang chờ khỏi accessibility, và chỉ công bố chương mới khi quyền/nội dung đã được xác minh. TTS không nhận văn bản cũ khi đang tải. Đo lại bounds kể cả khi kích thước view không đổi để khôi phục vị trí.
4. Lịch sử/bookmark và ví ở paywall từng nằm trên đường tải quan trọng. Chỉ lần mở đầu cần đọc tiến độ để khôi phục; các phần phụ tải độc lập. Paywall có điều hướng Trước/Tiếp/Danh sách nhưng vẫn kiểm tra quyền cho mọi chương.
5. Hủy RPC cũ khi đổi yêu cầu hoặc rời màn, bỏ phản hồi muộn, không dùng fallback offline sau cancellation. Foreground dùng chung prefetch đang chạy; lượt mở sau khi request kết thúc vẫn kiểm tra quyền mới. Cache 3 chương/tối đa 2 MiB ước tính/TTL 30 giây.
6. SDK interstitial có thể ném lỗi đồng bộ trước Promise.catch. Nay bắt cả hai dạng; việc cập nhật điều hướng diễn ra trước khi gọi quảng cáo. Không thay đổi thưởng 5 Hạ Phẩm, ví hay doanh thu tác giả.
7. Trên Samsung, engine có 11 giọng Việt nhưng UI giữ kết quả dò rỗng ban đầu. Tăng số lần dò có giới hạn, hiển thị trạng thái đang tìm, thêm nút tìm lại và giữ refresh khi quay lại app. Không chọn giọng ngoại ngữ thay thế.
8. Vuốt ngang mặc định bật với cấu hình mới; lựa chọn đã lưu vẫn được giữ. Chế độ page luôn hỗ trợ vuốt trang. Chương cuối có thông báo rõ.

## Bằng chứng dữ liệu thật

Truyện 2d94c50d-7013-4afb-a3ec-9bc65d8f614e đã dùng để thử trước đó: metadata công khai production trả HTTP 200, chỉ có chương 1 trạng thái published. Vì vậy không có chương kế tiếp công khai để chuyển. Không tạo/sửa/xóa chương hay dữ liệu production để làm phép thử.

## Các file chính

- app/reader/[bookId].tsx: điều hướng, responder thống nhất, giữ view, khôi phục vị trí, trạng thái tải/lỗi, paywall và bảng nghe.
- lib/readerEngine.ts: cancellation, prefetch và cache giới hạn.
- services/chapters.ts: AbortSignal đến RPC và xử lý hủy.
- services/chapterInterstitial.native.ts: lỗi SDK không ngắt điều hướng.
- services/storage.ts: cấu hình vuốt mặc định.
- services/tts.ts, hooks/useTtsPlayer.ts: dò lại giọng Việt.
- tests/web/reader-performance.spec.ts, tests/web/reader-gestures-demo.spec.ts: hồi quy thao tác/cài đặt.
- tests/performance-phase3-reader.mjs, tests/tts-discovery.mjs, tests/admob-runtime.mjs và script test:performance trong package.json: cancellation, TTL, TTS khởi tạo chậm, lỗi SDK.

## Kiểm thử tự động

TypeScript và unit hiệu năng/gesture/TTS đạt. Các bộ test:db/database/economy/AdMob dùng PGlite tạm đã đạt; không triển khai SQL. 22 ca reader và 1 ca cài đặt bổ sung đã đạt trước thay đổi giữ view. Lượt hồi quy 24 ca cuối đang được tổng hợp bên dưới. Một số lượt đầu gặp Metro chưa sẵn sàng/biên dịch lạnh; chỉ kết quả lượt hoàn tất được tính đạt.

## Samsung native qua USB

Thiết bị SM-T385K, Android 9, ARMv7. Windows nhận driver nhưng ADB lúc offline, log connection terminated: read failed; sau đổi cổng USB/Truyền tệp, thiết bị trở lại trạng thái device. ADB reverse cần thiết lập lại sau khi USB đổi transport; mất reverse đã gây connection refused tới Metro, không phải lỗi trình đọc.

APK development build và install -r thành công. Bản development chạy dữ liệu demo có sẵn, không thay dữ liệu production:

- Vuốt trái chương 1 → 2, vuốt phải quay lại.
- Lượt 30 vuốt đầu thực hiện 29 lần chuyển; một thao tác khi đang tải được bỏ qua. Không kẹt sau lượt thử.
- Sau giữ view, 30 vuốt thực hiện đủ 30 lần chuyển, chương 33 → 63.
- Chế độ page: 1/3 → 2/3 → 1/3 trong cùng chương; hết trang cuối sang chương 31; từ trang đầu quay về trang 3/3 chương 30.
- Cuộn nội dung tràn đến footer; nút Chương sau chuyển chương 30 → 31.
- TTS sau sửa: native engine báo speaking=true khi phát, false khi tạm dừng; có 11 giọng vi-VN. Không phải đánh giá chất lượng âm thanh bằng nghe trực tiếp.
- Tự cuộn đã bật được, kéo tay trở về điều khiển và tiến độ 6%; chưa phải benchmark hay kiểm thử kéo dài.

## Số đo và giới hạn

Số đo Hermes development demo, không phải release hoặc benchmark cùng điều kiện:

- Lượt đầu: open-to-ready p50 41 ms, p95 174 ms; callback layout p50 435 ms, p95 515 ms.
- Lượt giữ view (30 transitions): open-to-ready p50 219 ms, p95 251 ms, max 263 ms. View cùng chiều cao không phát onContentSizeChange nên lượt này không có mẫu callback layout; không được suy ra layout 0 ms. Đã bổ sung ghi nhận qua callback measure cho các lần đo sau.
- Không có A/B cùng tải nền, không tuyên bố phần trăm cải thiện. Mục tiêu toàn bộ chuyển chương dưới 200 ms và 60 FPS chưa được chứng minh trên Samsung này.

Native VIP/paywall, offline tải về, mạng chậm/ngắt/khôi phục và heap leak kéo dài chưa được nghiệm thu trên máy. Các luồng đó có hồi quy web/unit về khóa quyền, giấy phép offline, lỗi mạng/thử lại và phản hồi muộn; không thay thế hoàn toàn kiểm thử native. Chưa chi tiền hoặc nhận thưởng thật.

APK release cục bộ giữ quảng cáo thật tắt, chưa phải bản ký Play. Trạng thái build/cài cuối và commit/push được cập nhật bên dưới.

## Kết quả bàn giao

- Các ca hồi quy reader cuối: 24 ca có kết quả đạt. Lượt toàn bộ có 20 đạt và 4 lỗi môi trường (server chưa sẵn sàng/biên dịch lạnh/màn khởi động quá 5 giây); chạy lại 3 ca đầu và ca chọn VIP riêng đều đạt, không bỏ qua assertion chức năng. Ca giữ ScrollView qua tải, TTS, paywall, lỗi mạng/thử lại, offline và 30 nút chuyển chương đều đã chạy đạt.
- TypeScript cuối đạt; test:performance gồm TTS discovery/cancellation/TTL đạt. Database/AdMob đã đạt như trên.
- Android release cuối build thành công 4m06s, 661 tasks (12 executed). APK đã xác minh chữ ký và cài cập nhật thành công bằng adb install --no-streaming -r sau khi streaming bị kẹt. Không gỡ ứng dụng, không xóa dữ liệu. Release đã mở lại truyện công khai và khôi phục tiến độ 8% có sẵn.
- Cuộn release sau khi tải xong, 10 vuốt dọc: 625 frames, 8 janky (1,28%), p50 9 ms, p95 12 ms, p99 17 ms. Đây chỉ là lượt cuộn đã làm nóng, không bao gồm mở app/chuyển chương, không chứng minh mọi màn đạt 60 FPS.
- APK: .cache/artifacts/chuong-reader-fix-release-armv7.apk; 45.591.745 bytes; SHA-256 834BCCF02659281607F03EAFE048439C8E32E51FE6BC0595E896BABDF76ABC70.
- Các giới hạn native VIP/offline/mạng yếu/heap leak kéo dài ở phần trên vẫn còn; không báo đã nghiệm thu những ca này. Không có giao dịch tiền/thưởng thật hay thay đổi production.
