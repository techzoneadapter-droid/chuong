# CHƯƠNG — Phase 3B: Reader gestures

Ngày 2026-10-10. Nhánh: `backup/chuong-performance-phase2`. Thay đổi local, không commit/push/deploy.

## Kiểm toán và phạm vi

Đã kiểm tra working tree và đọc `performance-phase3-reader.md` trước khi sửa. Các thay đổi Phase 3 chưa commit và các tệp Phase 2 untracked có sẵn được giữ lại. Reader đã tải một body, có catalog TTL 30 giây, singleflight pending request, LRU văn bản tối đa 3 chương/2MiB ước tính, prefetch giới hạn, xử lý TTS hợp tác và lưu tiến độ mỗi 4 giây. Không triển khai lại các cơ chế này.

Reader dùng PanResponder cho lật trang; dự án không khai báo gesture-handler/Reanimated. Phase 3B dùng PanResponder của React Native và một listener DOM riêng cho web. Không thêm thư viện hoặc đổi cấu hình native. [PanResponder](https://reactnative.dev/docs/panresponder) phối hợp qua responder system; [ScrollView](https://reactnative.dev/docs/scrollview) có cơ chế khóa touch riêng, nên kiểm thử tranh chấp với cuộn là cần thiết.

## Nhận diện và điều hướng

- Vuốt trái → chương sau; vuốt phải → chương trước. Dùng số chương lân cận trong catalog, không giả định số liên tiếp.
- Kéo ngón tay lên ở cuối văn bản → chương sau; kéo ngón tay xuống ở đầu → chương trước. Phải bắt đầu ở biên: một lần cuộn từ giữa chương không biến thành điều hướng khi chạm cuối. Cuối văn bản được đo riêng, trước quảng cáo/bình luận; không cần cuộn toàn bộ phần thảo luận.
- Một ngón tay, trục chính lớn hơn 2 lần trục phụ. Nhận ý định ngang sau 24dp, dọc hướng ra ngoài biên sau 6dp để phối hợp với scroll responder; các ngưỡng điều hướng vẫn lớn hơn nhiều. Vuốt chéo đã bị loại không được đổi ý thành vuốt ngang trong cùng phiên touch.
- Không bắt đầu trong vùng hai mép ngang rộng tối thiểu 32dp (hoặc safe-area inset +12dp nếu lớn hơn), vùng trên safe area +12dp hoặc dưới safe area +32dp. Không chiếm responder khi chạm xuống. Vùng nhận chỉ bao quanh tiêu đề/văn bản; nút trang/chương, quảng cáo, bình luận, toolbar và sheet không nằm trong vùng này.
- Sau 350ms chưa nhận được ý định, bỏ qua để nhường thao tác giữ/chọn/chia sẻ văn bản. Web cũng bỏ qua khi có text selection. Đa chạm, responder terminate và trạng thái không sẵn sàng hủy cử chỉ.

| Độ nhạy | Khoảng cách tối thiểu | Vận tốc trung bình tối thiểu |
| --- | ---: | ---: |
| Thấp | 120dp | 0,12dp/ms |
| Vừa | 88dp | 0,10dp/ms |
| Cao | 64dp | 0,08dp/ms |

Phải đạt cả khoảng cách và vận tốc, hoàn thành trong 1.400ms. Ngưỡng là giá trị khởi đầu đã kiểm thử bằng helper/Chromium, **chưa hiệu chỉnh trên Samsung/iPhone thật**. Vận tốc là khoảng cách từ đầu touch chia thời gian; không tuyên bố đây là vận tốc tức thời native.

Một gợi ý nhỏ hiện sau khi nhận ý định, đổi thành “Thả để chuyển chương” khi đủ ngưỡng; màu viền phản hồi nhẹ, không animation/timer theo frame. Chỉ cập nhật state khi mức phản hồi thay đổi. Khi đang tải dùng LoadingState hiện có với nhãn “Đang chuyển chương…”. Cử chỉ được consume trước điều hướng; một ref khóa đồng bộ ở `goChapter` chặn cử chỉ/nút/TTS điều hướng lặp trong khoảng trước render và suốt lúc tải. Kết quả tải cũ tiếp tục bị active guard Phase 3 loại bỏ.

Web cần listener `touchmove` không passive trên vùng văn bản để chặn browser pan **chỉ với kéo hướng ra ngoài biên**. Nếu không, browser cuộn rồi phát touchcancel, khiến kéo ở cuối chương dài thất bại dù nhận diện đúng. Listener không chặn kéo ngược vào nội dung, đa chạm, giữ lâu hoặc chọn text; được gỡ khi ref unmount và khi hook cleanup. Native không dùng listener DOM.

## Cài đặt và vị trí đọc

Các tùy chọn có trong cả sheet Reader và trang `Giao diện & đọc`, lưu vào `reader:settings` hiện có:

- Vuốt ngang chuyển chương: mặc định **tắt**.
- Kéo vượt đầu/cuối: mặc định **tắt**.
- Độ nhạy: mặc định Vừa.
- Khi về chương trước: mặc định Vị trí đã đọc, có tùy chọn Cuối chương.

Các field mới optional nên dữ liệu settings cũ vẫn đọc được, không migration/xóa dữ liệu. Khi bật vuốt ngang trong chế độ lật trang, vuốt sẽ chuyển chương; các nút Trang trước/Trang sau tiếp tục lật từng trang. Khi tắt, PanResponder lật trang cũ được giữ nguyên.

Chuyển chương sau luôn về đầu. Trong cùng phiên Reader, lưu tối đa 3 vị trí gần đây (chỉ pixel/phần trăm, không body) để quay lại vị trí đã đọc. Vị trí này không thay thế storage tiến độ chính. Đổi book/account/engine giải phóng map. Nếu không có vị trí trong map, về đầu như luồng chuyển chương trước hiện có; khi mở lại Reader vẫn khôi phục storage hiện có. Tùy chọn Cuối chương chờ đo layout văn bản, không dùng timer hoặc cuộn qua bình luận. Page mode dùng cơ chế phần trăm/trang hiện có. Offset thông thường trong storage không bị ép giới hạn vào vùng văn bản.

## Quyền truy cập và hiệu năng

Tất cả cử chỉ gọi cùng `goChapter` với các nút; tải body qua Reader engine và `get_chapter_for_reading` hiện có. Không thêm RPC unlock/purchase hoặc trừ Linh Thạch. Paywall hiện có vẫn hiện khi RPC báo khóa. Nội dung LRU đã tải trước không cấp quyền: navigation phải kiểm tra lại server hoặc license/checksum offline hiện có. Do đó cache chỉ giúp dùng lại paragraph array sau khi đã kiểm tra quyền; **không hiển thị tức thì body dựa trên quyền cũ**.

Prefetch Phase 3 vẫn tối đa hai chương free lân cận, một request tại một thời điểm, sau delay/idle và chỉ khi foreground/focused; VIP không được prefetch. Không đưa toàn bộ truyện vào RAM. Text paragraphs vẫn memoized theo nội dung/font/style; feedback/tiến độ không dựng lại paragraph elements khi dependency không đổi. Gesture session/callback đọc dữ liệu mới qua ref, không tạo lại PanResponder mỗi lần phần trăm tiến độ thay đổi. Không ghi storage theo touch/scroll; flush 4 giây và lifecycle hiện có vẫn giữ nguyên.

Gesture transition dừng TTS cũ, không tự phát chương mới. Manual/automatic navigation bên trong audio vẫn dùng resume intent Phase 3. Run guards của TTS bỏ qua completion callback muộn. Không thêm xử lý offline, network, text hoặc animation vào mỗi touch move.

## Kiểm thử và giới hạn

- `node tests/reader-gestures.mjs`: đạt hướng ngang/dọc, biên, mép hệ thống, khoảng cách/vận tốc, chéo, giữ lâu, đa chạm, một lần thả, terminate/cleanup.
- TypeScript, Phase 3 helper và cả 5 suite `test:db` đã đạt. UI copy/admin syntax đạt.
- Chromium touch tests đạt ngang/thứ tự thưa/paywall, chương ngắn/đầu-cuối catalog, settings persistence, mép/chéo/mặc định tắt, vuốt tiếp lúc đang tải, chương dài về cuối văn bản, offline và TTS đang đọc/callback muộn.
- Lượt Reader đầu: 14/16 đạt. Hai lỗi là browser pan hủy touch ở biên chương dài và điểm touch offline nằm ngoài văn bản. Sau sửa listener và chọn tọa độ body thực, cả hai đã đạt; ca TTS gesture mới cũng đạt. Lượt toàn bộ Reader cuối: **17/17 đạt**, 1,3 phút.
- Các helper Phase 1/2 vẫn đạt. `test:release` vẫn lỗi JSON BOM có sẵn trong `app.json`; Phase 3 đã ghi nhận thêm kỳ vọng AdMob cũ. Không thay config/dependencies để làm test này xanh.
- Demo/artwork/Phase 2 UI: lượt đầu 5/7 đạt, hai test chạm giới hạn 30 giây ở cold-Metro page load và chuỗi 20 routes. Retry riêng với timeout CLI 90 giây đạt artwork mobile/desktop (21,5 giây) và 20 routes (49,2 giây). Test settings chung → Reader → reset mới cũng đạt (15,1 giây). Tổng cộng 8 ca UI khác nhau đạt qua các lượt; không đổi timeout mặc định của dự án.
- Expo Metro đã hoạt động trên server backend/demo riêng phục vụ các bài test và được dừng sau kiểm thử; không dừng hoặc sửa cấu hình phiên Live Preview của người dùng.
- Bản cuối TypeScript/helper đạt, gồm thêm ngón thứ hai rồi thả mà không có touch move: cử chỉ vẫn bị hủy. Production export **web/Android/iOS đạt** tại `.cache/performance-phase3-gestures-release`: web main 2,98MB, Android Hermes 5,59MB, iOS Hermes 5,60MB, 113 assets. Đây là kích thước artifact, không phải số liệu giảm RAM/khởi động. Chưa chạy Gradle/Xcode hoặc kiểm thử native trên thiết bị.

Trong lượt cuối, dev-web mở/chuyển kế tiếp lần lượt 2.529/219ms (100 chương), 2.451/151ms (500), 2.832/345ms (1.201); chương 2.000 đoạn mở/khôi phục 4.279ms. Đây là mẫu đơn mock-backend, không thống kê percentile, không đo native và không chứng minh cải thiện tốc độ so với Phase 3.

Không có đo native UI/JS FPS, RAM, power, cold start hoặc percentile gesture latency. Không tuyên bố “ultra-smooth” đã chứng minh trên thiết bị. Scroll mode vẫn dựng toàn bộ chương; không virtualization khi chưa có đo native và kiểm thử chọn văn bản/offset. Metadata count Phase 3 vẫn 1/2/3 cho 100/500/1.201 chương trong luồng mở → sau → trước; đây là request count dev-web, không phải tốc độ Android/iOS.

## File thay đổi trong Phase 3B

1. `app/reader/[bookId].tsx`: tích hợp gestures, khóa điều hướng, đo biên văn bản, recent position/arrival, feedback/loading label và settings.
2. `hooks/useReaderGestures.ts` (mới): responder session, latest refs, feedback và cleanup listener web.
3. `lib/readerGestures.ts` (mới): hướng, biên, vùng loại trừ và ngưỡng thuần.
4. `types/index.ts`: optional settings fields.
5. `services/storage.ts`: defaults an toàn.
6. `tests/reader-gestures.mjs` (mới): kiểm thử math/responder.
7. `tests/web/reader-performance.spec.ts`: mở rộng Phase 3 với touch gestures, offline và TTS.
8. `docs/performance-phase3-gestures.md` (mới): báo cáo này.
9. `app/settings/reading.tsx`: cùng tùy chọn cử chỉ trên trang settings chung.
10. `tests/web/reader-gestures-demo.spec.ts` (mới): mặc định an toàn, đồng bộ lựa chọn từ settings sang Reader và reset.

Các file engine/TTS/chapter/progress và báo cáo Phase 3 trước đó không bị xóa hoặc viết lại. Assets, schema, kinh tế/VIP/doanh thu, quảng cáo/IAP/thanh toán, dependencies/lockfile và EAS/Expo Live Preview config không đổi.

## Rebuild và bước tiếp theo

Thay đổi TypeScript/React Native thuần, không thêm native module: **Fast Refresh/reload đủ để kiểm thử trong Development Build hiện có**, không cần rebuild APK vì Phase 3B. Production vẫn cần quy trình build/update thông thường. Expo exports chỉ xác nhận bundling, không thay Gradle/Xcode build hoặc test native.

Trên Samsung Android 9 và iPhone: bật từng loại cử chỉ, kiểm tra vuốt chậm/nhanh/chéo, long press/chọn văn bản, OS Back và bottom-home gesture, scroll momentum/font changes, pull đầu/cuối cả chương ngắn/dài, app background giữa touch, TTS native, offline/license expiry và điều hướng lặp. Bắt đầu Vừa; giữ mặc định tắt cho đến khi xác nhận không xung đột. Dùng cùng dữ liệu/network cho release và development, đo p50/p95 response, JS lag, native dropped frames và RAM. Nếu PanResponder bị native scroll takeover trên thiết bị, cần profiling trước khi cân nhắc gesture-handler/native module và yêu cầu rebuild riêng; không tự cài trong Phase này.
