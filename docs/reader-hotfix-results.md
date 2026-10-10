# Reader hotfix — gestures và TTS tiếng Việt

Ngày: 10/10/2026. Nhánh: `feature/reader-gestures-free-preview`.
Mốc trước sửa: `50ee102`. Working tree sạch lúc bắt đầu, không có thay đổi chưa commit cần checkpoint. Không push main, không thao tác Supabase production.

## Lỗi gốc và thay đổi

- Gesture gọi setter ở mỗi touch move dù giá trị chỉ báo không đổi. Dùng ref giữ phiên kéo và so sánh trước khi gọi setter; chỉ cập nhật khi chỉ báo thay đổi.
- Biên chỉ được chụp lúc chạm; phiên cuộn bình thường bị loại bỏ trước khi đến biên. Đọc offset/viewport/vị trí cuối văn bản mới nhất, đặt lại mốc kéo khi vừa đến biên, không tính quãng cuộn trước đó vào ngưỡng.
- PanResponder reset dx/dy khi được grant, làm mất quãng vuốt trước khi nhận responder. Giữ phần dịch chuyển này; ngưỡng low/medium/high là 96/64/48 dp, giữ kiểm tra hướng, tốc độ, đa chạm, long press và vùng Back hệ điều hành.
- ScrollView tự ghi đè callback responder và có thể từ chối nhường responder sau khi cuộn. Handler đặt trên View bao ngoài; tắt responder JS mặc định của ScrollView khi bật kéo biên, vẫn giữ cuộn native. Web có listener release riêng khi không nhận được grant, kiểm tra chống chuyển hai lần và vẫn xử lý touch không cancelable.
- Android native có thể hủy chuỗi touch JS khi bắt đầu cuộn. Fallback là vùng kéo cao 28 dp tại biên trên/dưới phần đọc, chỉ xuất hiện trong cây touch khi có chương tương ứng và bật kéo biên. Nó nhận riêng lần kéo ở biên; phần cuộn còn lại vẫn native. Nếu chuỗi touch đã bị hủy, cần thả rồi kéo tiếp ở biên, không cam kết tiếp nhận cùng ngón xuyên suốt phiên cuộn đó.
- Trong lúc tải chương, giữ vùng đọc/ScrollView mounted và che nội dung cũ bằng loading overlay; chặn tương tác và accessibility với nội dung đang thay. Paywall/lỗi vẫn theo luồng cũ. Giữ khóa chuyển chương đang tải, dedup, prefetch quyền đọc và LRU Phase 3 hiện có.
- Sau tải, đo lại biên native một lần để xử lý các chương có cùng chiều cao không phát onLayout mới; callback cũ có cancellation guard. Khôi phục cả offset bằng 0, không dựa vào việc remount để quay về đầu.
- Play trước đây phụ thuộc danh sách voice tiếng Việt. Nay phụ thuộc nội dung đã chuẩn bị; danh sách rỗng được thử giọng tiếng Việt mặc định. Chỉ chọn identifier có language tiếng Việt. Nếu native engine trả danh sách không rỗng nhưng không có tiếng Việt, báo cài gói tiếng Việt thay vì yêu cầu engine fallback ngoại ngữ.
- expo-speech 14.0.8 Android dùng `Locale(language)`; gửi `vi` thay vì `vi-VN` để tránh chuỗi bị hiểu thành mã ngôn ngữ không hỗ trợ. iOS/web tiếp tục `vi-VN`. Không sửa native dependency.
- Timeout trước đây kết thúc như đã đọc xong. Nay timeout báo lỗi, dừng speech, không gọi hoàn thành/tự chuyển chương. Stop giải quyết promise/timer ngay cả khi engine không gửi onStopped; callback đến muộn bị bỏ qua. Văn bản vượt giới hạn engine được đọc thành các phần tuần tự, không cắt đuôi.
- Voice enumeration có deadline 1,5 giây mỗi lượt và dedup các lượt thử đồng thời. AudioSheet có lỗi thực tế, hướng dẫn và nút thử lại. Không enumerate voice/chia TTS khi chỉ đọc; Stop chưa từng phát không khởi tạo engine native. Sau chuyển chương thủ công, không tự chuẩn bị TTS chương mới; tự chuyển chương đang nghe giữ luồng resume.
- Giải phóng text/segments TTS cũ khi audio text trở về rỗng, tránh giữ chương đã nghe trong bộ nhớ khi chỉ đọc chương mới.

## Số liệu đã đo

Không có kết nối Samsung/thiết bị iOS hay adb trong phiên này. Chưa đo JS FPS, UI FPS, RAM sau 20 chương, độ trễ touch phần cứng hoặc âm thanh thật. Bundle thành công không chứng minh độ mượt native.

So sánh cùng fixture hook, 200 move có cùng trạng thái: **202 lần gọi setter trước sửa (`50ee102`), 3 sau sửa** (hiện/đạt ngưỡng/ẩn). Đây là số lời gọi setter, không phải số React render; bản cũ có thể bailout giá trị trùng.

Đo development browser Chrome/Windows, API giả lập localhost, 20 lần vuốt chuyển 20 chương có khoảng cách số chương 3, nội dung khoảng 1,2 nghìn ký tự/chương. Diagnostics đếm lời gọi hàm Reader, không đếm commit hay UI frame. Mốc đo bắt đầu trước swipe và kết thúc khi body chương mới xuất hiện. Không có baseline render/timing native để tính phần trăm cải thiện.

| Phép đo | Kết quả |
|---|---|
| Reader render mỗi lần vuốt | 6 ở cả 20 lần; không có baseline Reader render trước sửa |
| Release handler JS → callback điều hướng | p50 0,1 ms; p95 0,2 ms; max 0,2 ms; không bao gồm độ trễ giao touch từ hệ điều hành |
| RPC chương + chuẩn bị văn bản | p50 58,6 ms; p95 165,8 ms; max 229,5 ms; API localhost |
| Bắt đầu load → dữ liệu ready | p50 60,5 ms; p95 167,1 ms; max 233,7 ms; chưa phải frame native được vẽ |
| Ready → layout callback | 19 mẫu: p50 27,7 ms; p95 44,4 ms; max 54,8 ms; chiều cao không đổi có thể không phát callback |
| TTS prepare trong 20 lần đọc thường | 0 mẫu |
| Vùng đọc mounted qua 20 chương | Kiểm tra identity DOM, không chỉ kiểm tra tiêu đề |

Cải thiện dự kiến trên máy thật: giảm công việc JS trong gesture, giảm remount/layout khi chuyển chương và tránh khởi tạo/chia TTS lúc đọc thường. Chưa xác nhận mức giảm giật hay RAM trên Samsung.

## Kiểm thử

- TypeScript: PASS.
- `tests/reader-gestures.mjs`: PASS, gồm biên cập nhật sau 500 ms cuộn, 200 move, mất quãng kéo khi grant, fallback Android, touch web không cancelable, single release, đa chạm, long press, cạnh hệ điều hành và cleanup.
- `tests/reader-hotfix-tts.mjs`: PASS với engine giả lập: vi/vi-VN mặc định, voice tiếng Việt, engine thiếu tiếng Việt, enumeration treo/dedup, onStart/onDone/onStopped/onError, timeout không hoàn thành, Stop không callback, callback muộn, input dài giữ đầy đủ và Stop chưa dùng không khởi tạo native.
- `tests/performance-phase3-reader.mjs`: PASS: text/TTS parity, TTL, LRU, dedup, quyền đọc mới nhất, offline lease/reconnect.
- `npm run test:db`, `npm run test:free-preview`: PASS trên PostgreSQL/PGlite cô lập; không kết nối database production.
- UI copy và syntax admin web: PASS; không sửa mã admin.
- Browser Reader development: 21/21 PASS; sau chỉnh sửa cuối, kiểm tra lại 8/8 luồng biên/chương dài/font/page/khôi phục/TTS/offline/vuốt đang tải PASS.
- Expo export cuối cùng Android/iOS/web: PASS. Hermes Android 5,61 MB, iOS 5,61 MB; entry web 2,99 MB. Đây là xuất bundle, không phải cài/chạy release native trên thiết bị.
- Browser release cuối cùng: **41/41 PASS** (21 Reader, 20 backend), 1,9 phút. Gồm 20 swipe liên tiếp giữ identity DOM, tải chậm không bỏ qua chương, gesture biên, lock/VIP, TTS chuyển chương, offline, vị trí và font/page; backend kiểm tra thêm đăng nhập/đăng xuất, author editor/autosave, wallet, hai loại Linh Thạch, paywall/gift và notifications trên fixture.
- `npm run test:release`: FAIL ở kiểm tra tên ứng dụng có sẵn trong app.json (`CHÆ¯Æ NG` thay vì `CHƯƠNG`). Không bỏ qua gate và không sửa cấu hình Expo trong hotfix này.

Một test cũ chờ tiêu đề mới rồi kiểm tra số request quá sớm: tiêu đề thay trước khi RPC chậm xong. Đã sửa test chờ body chương mới. Các lượt chẩn đoán chạy song song từng gây tranh chấp thư mục trace; lượt xác nhận cuối dùng output riêng, không tính các lượt đó là kết quả pass.

Fixture biên trong cùng phiên touch điều khiển scroll offset và touch delivery trên browser để kiểm tra logic biên; không thay cho thử overscroll Android/iOS. Chương dài 2.000 đoạn/526.888 ký tự đã được giữ nguyên sau đổi font/cỡ chữ và chế độ; lượt development cuối kiểm tra nhóm này mất 4.702 ms, release web 2.441 ms từ mở đến body/khôi phục theo assertion browser. Có tải app và polling test; đây là khác biệt hai loại build trên host/mock, không phải thời gian render native hoặc phép so sánh trước/sau hotfix.

Một lượt release web cuối với catalog 100/500/1.201 chương: mở Reader đến assertion tiêu đề lần lượt 814/861/1.027 ms; bấm chương sau đến assertion tiêu đề mới 123/123/129 ms; metadata request 1/2/3, body request `[1,4,1]`. Assertion tiêu đề không xác nhận frame hay nội dung hoàn tất. Đây là số đo đơn lẻ localhost, không có baseline cùng điều kiện và không đại diện API production/Samsung.

## File thay đổi

- `app/reader/[bookId].tsx`: giữ mount, chặn loading, cập nhật biên, fallback Android, lazy TTS, retry UI, diagnostics render.
- `hooks/useReaderGestures.ts`, `lib/readerGestures.ts`: ref/state transitions, ngưỡng, biên sống, quãng kéo đầy đủ và xử lý responder/fallback.
- `hooks/useTtsPlayer.ts`, `services/tts.ts`: default tiếng Việt, lifecycle/cancellation, timeout, voice dedup/deadline, lazy engine và input dài.
- `lib/readerPerformance.ts`: đếm render và thời gian dispatch, chỉ bật chủ động trong development.
- `tests/reader-gestures.mjs`, `tests/reader-hotfix-tts.mjs`, `tests/performance-phase3-reader.mjs`, `tests/web/reader-performance.spec.ts`: regression và đo fixture.
- `.github/workflows/ci.yml`: thêm test TTS vào nhóm Reader hiện có.
- `docs/reader-hotfix-results.md`: báo cáo này.

## Kiểm tra Samsung Android 9

1. Dùng Development Build/Live Preview hiện tại. Khởi động lại Metro với môi trường dự án và `--clear` để không dùng cache bundle QA localhost. Không đổi app.json, native dependencies hoặc build profile. Reload ứng dụng sau khi nhận hotfix.
2. Trong Giao diện, bật vuốt ngang và kéo biên; thử độ nhạy medium trước. Vuốt trái/phải 20 lần, vuốt tiếp lúc request đang tải, thử chương ngắn/dài/VIP. Không được bỏ qua chương, đọc nội dung khóa hoặc trừ Linh Thạch tự động.
3. Cuộn đến cuối văn bản rồi kéo lên để sang chương sau; ở đầu kéo xuống để về chương trước. Đủ ngưỡng hiện “Thả để chuyển chương”, thả mới chuyển. Nếu Android đã hủy touch của phiên cuộn, thả tay và kéo tại dải biên ngay phía trên toolbar hoặc dưới header. Thử cuộn ngược, chạm ngắn, chọn chữ, kéo chéo, hai ngón và Back ở mép màn hình.
4. Mở Nghe → Play. Xác nhận phát tiếng Việt thật; Pause/Resume, Stop, tốc độ và tự chuyển chương. Chuyển chương bằng gesture khi đang nghe: speech cũ phải dừng, callback muộn không được chuyển thêm chương. Engine lỗi/treo phải báo lỗi, không tự báo đọc xong.
5. Nếu thiếu giọng: Cài đặt Samsung → Quản lý chung/Ngôn ngữ và nhập → Chuyển văn bản thành giọng nói → chọn engine, tải dữ liệu giọng tiếng Việt, nghe mẫu hệ thống; quay lại bấm “Thử lại giọng tiếng Việt”. Đường dẫn có thể khác theo engine/One UI. Kiểm tra âm lượng media và tải gói hỗ trợ offline trước khi tắt mạng.
6. Tải truyện được phép đọc, tắt mạng, đổi chương, thoát/mở lại để kiểm tra vị trí và bookmark. Đổi font/cỡ chữ, scroll/page và kiểm tra đủ nội dung.
7. Với React Native DevTools console, chạy `globalThis.__CHUONG_READER_PERF__.start()` trước thao tác, `report()` và `stop()` sau đó. Bật Performance Monitor để ghi JS/UI FPS nếu build hỗ trợ; dùng profiler/memory công cụ thiết bị cho RAM. Ghi model, Android, engine/voice, loại build, độ dài chương, mạng và cả lỗi. So sánh cùng workload ở release trên cùng máy; không quy thời gian Metro/HMR thành startup release.

## Giới hạn còn lại

- Fallback Android ở dải biên và tương tác chọn chữ tại dải này cần kiểm tra máy thật. Không có thư viện gesture native mới; chưa đảm bảo cùng ngón kéo xuyên phiên cuộn khi native đã gửi touch cancel.
- Danh sách voice hoàn toàn rỗng/timeout không chứng minh engine có hoặc không có tiếng Việt. Cho thử default để không khóa Play sai; API Expo hiện tại không báo voice thực tế đã chọn. SDK có fallback nội bộ nếu ngôn ngữ thiếu, nên phải xác nhận âm thanh/default trên Samsung; không coi callback onStart là bằng chứng phát đúng tiếng Việt.
- Pause/Resume Android giữ vị trí phân đoạn và đọc lại phân đoạn đang dở. Native pause/resume không có trên Android theo [Expo Speech SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/speech/). iOS máy thật cần tắt silent mode theo cùng tài liệu.
- RAM, FPS, TTS phát thật, mất mạng engine và tương thích runtime Android 9/iOS chưa xác nhận bằng thiết bị; chỉ đã kiểm tra logic/bundle.

Không sửa database/schema, production, logic VIP/giá/Linh Thạch/thanh toán/doanh thu, asset tiên hiệp, cấu hình Live Preview hoặc admin web. Các thay đổi giữ trên nhánh hiện tại để kiểm thử.
