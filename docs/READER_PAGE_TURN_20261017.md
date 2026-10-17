# Nâng cấp lật trang Android — 17/10/2026

## Phạm vi

Giữ trình đọc, engine tải nội dung và luồng kiểm tra quyền hiện có. Không sửa cơ sở dữ liệu production, chính sách thưởng 5 Hạ Phẩm, doanh thu, thanh toán hoặc bật quảng cáo thật. APK USB dùng ARMv7 cho Samsung SM-T385K, Android 9/API 28; không dùng APK này để phát hành Play Store.

## Nguyên nhân và cách sửa

- PanResponder trên Android có thể mất chuỗi cảm ứng khi ScrollView bắt đầu cuộn. Tùy chọn vuốt ngang đã lưu trên máy thử cũng đang tắt. Native chuyển sang Gesture Handler; web giữ bộ xử lý cũ.
- Hai recognizer phân biệt trục. Kéo dọc chỉ được nhận nếu **lần chạm mới** bắt đầu tại đầu/cuối phần văn bản; cuộn tới ranh giới, quán tính và tự cuộn không tự chuyển chương. Ranh giới không tính phần bình luận/quảng cáo.
- Thả thiếu khoảng cách, kéo ngược trước khi thả, ACTION_CANCEL và đa chạm không hoàn tất lật. Cử chỉ bắt đầu lúc đang chuyển vẫn bị từ chối dù chương mới kịp tải trước lúc ngón tay thả ra.
- Nút trang, chạm mép và vuốt cùng gọi luồng điều hướng đọc. Chỉ qua chương khi hết trang; nút chương/mục lục tiếp tục dùng goChapter và kiểm tra quyền hiện có.
- Ba lựa chọn lưu trong reader:settings: Lật sách 3D, Trượt mượt, Không hiệu ứng. Không ghi đè lựa chọn tắt cử chỉ đã lưu trước đó. Mặc định bật kéo vượt ranh giới cho cài đặt mới.
- Giữ vị trí khi đổi Lật trang ↔ Cuộn dọc: chỉ số trang không được dùng như pixel. Khi sang cuộn, đo chiều cao content view hiện tại sau commit, quy đổi tiến độ sang offset; không dùng sự kiện kích thước cũ đang nằm trong hàng đợi. Khi về lật trang, đưa viewport về đầu trang tương ứng. Native đã xác nhận cả trang 13/25 (50%) và 25/25 (100%) quay lại đúng trang ban đầu sau một lần cuộn nhỏ để kiểm tra vị trí thực.

## Dựng hình và bộ nhớ

- Reanimated 4.1.x, Worklets 0.5.1, Gesture Handler 2.28.x theo bộ phiên bản Expo SDK 54. Gesture và transform chạy trên UI thread, không setState theo pixel, không dùng setInterval để dựng hiệu ứng.
- Trang giấy dùng perspective, xoay Y theo hướng, easing và bóng mép bốn lớp. Kéo theo tay; thả để hoàn tất/hủy trong khoảng cấu hình 200–350 ms. Chế độ cuộn dùng chuyển nhẹ.
- Chỉ dựng trang hiện tại và tối đa hai trang kề của **chương đã được phép đọc**. Không dựng preview nội dung chương khác; khi vượt chương, hiển thị nền tải trung tính cho tới khi kiểm tra quyền hoàn tất.
- Phân trang chia cả đoạn văn nhập khẩu quá dài tại khoảng trắng; giữ nguyên ký tự và không cắt đôi surrogate pair. Không tải cả sách vào RAM. Cache/prefetch có giới hạn và tái kiểm tra quyền trong readerEngine không thay đổi.
- Lớp GPU cache chỉ bao phủ viewport của trang 3D, không cache toàn bộ chương cuộn dài. Transform/bóng chỉ cập nhật thuộc tính không ảnh hưởng layout.
- ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS bật đường cập nhật native cho transform/opacity. Điều khiển trong lớp chuyển động dùng Pressable của Gesture Handler; lúc đang chuyển chặn input con và vị trí nghỉ luôn là transform identity. Không hiệu ứng/Reduce Motion đặt rõ identity để không giữ transform của lựa chọn trước.
- Android 32-bit ARMv7 dưới 3 GiB RAM dùng chuyển động phẳng ngay từ đầu; Samsung SM-T385K có khoảng 1,81 GiB RAM thuộc nhóm này. Lựa chọn 3D vẫn được lưu, nhưng hiển thị trượt để ưu tiên phản hồi. Trên máy mạnh hơn, nếu trên 20% mẫu vượt 25 ms sau tối thiểu 30 frame, giảm 3D về trượt sau khi thao tác hiện tại kết thúc. Khi rời màn hình reader, ngừng frame callback và cử chỉ. Điều hướng khi app ở nền bỏ qua animation để TTS không phải chờ UI đang tạm dừng. Tôn trọng Reduce Motion hệ thống.
- Chế độ Không hiệu ứng bỏ cập nhật drag theo pixel và bỏ chuyển động của bóng/preview. ACTION_CANCEL phải có success=true mới được gọi hoàn tất; onFinalize(false) trả giấy về vị trí cũ. Cử chỉ ở khu vực bình luận/quảng cáo không được nhận làm thao tác chuyển trang.

## Kiểm thử

`npm run verify` đã chạy lại trên mã nguồn bàn giao cuối (gồm TTS nền và giữ vị trí qua đổi chế độ) và hoàn tất với exit code 0: TypeScript, performance/gesture, UI copy, admin syntax, 730 kiểm tra release, database/economy/AdMob và xuất web. Log cục bộ: `.cache/page-turn-verify-final-source.log`. Cảnh báo cấu hình có sẵn: EAS projectId chưa được liên kết; build USB cục bộ không cần EAS. Kiểm tra cú pháp các script Android và git diff --check cũng qua.

Unit test của mã cuối đã qua: ngưỡng kéo, hủy/reverse/đa chạm, cử chỉ bắt đầu khi đang bận, callback muộn sau unmount, giới hạn vùng đọc, lựa chọn chất lượng theo RAM/ABI, Không hiệu ứng không cập nhật drag theo pixel, phân trang dài không mất ký tự. Ở vòng web trước sửa quy đổi vị trí, Playwright đã qua 26 ca riêng biệt (24 ca hồi quy và 2 ca tùy chọn/đoạn văn dài), gồm VIP/offline/TTS, 30 lần điều hướng, danh sách chương thưa và văn bản 526.888 ký tự. Sửa vị trí cuối được kiểm tra trực tiếp bằng ca native ở hai mốc của chương thật 25 trang. Các ca backend giả lập/cơ sở dữ liệu kiểm thử cục bộ không ghi production.

Đo **APK QA release cuối**, sách demo cục bộ Kiếm Yên Vân, font 18/cách dòng thường, trên Samsung SM-T385K Android 9 ARMv7 khoảng 1,81 GiB RAM. Đã gửi 30 cử chỉ cho mỗi lượt, đối chiếu trạng thái đầu/cuối với mô hình chương/phân trang: chuyển chương 110 → 140; Sách 3D tự giảm 140/trang 1 → 149/trang 2; Trượt 149/trang 2 → 158/trang 4; Không hiệu ứng 158/trang 4 → 168/trang 3. Không gọi UIAutomator giữa các cử chỉ khi đo. Các ca chức năng riêng kiểm tra từng thao tác.

| Lượt đo cuối | gfxinfo: tổng / janky | Jank | Render p50 / p95 | Missed Vsync | SurfaceFlinger p50 / p95 |
| --- | --- | --- | --- | --- | --- |
| 30 chương, cuộn dọc + trượt | 1.333 / 55 | 4,13% | 10 / 16 ms | 2 | 16,71 / 16,87 ms |
| 30 trang, Sách 3D **tự giảm thành trượt** | 951 / 143 | 15,04% | 10 / 42 ms | 10 | 16,72 / 18,43 ms |
| 30 trang, Trượt mượt | 966 / 138 | 14,29% | 11 / 32 ms | 11 | 16,72 / 16,86 ms |
| 30 trang, Không hiệu ứng | 184 / 90 | 48,91% | 15 / 44 ms | 2 | 16,71 / 16,81 ms |

Samsung có màn hình 60 Hz. SurfaceFlinger chỉ giữ khoảng 128 lần trình bày gần nhất; bảng dùng 83–120 khoảng frame hoạt động và lọc khoảng nghỉ trên 100 ms, **không phải FPS trung bình toàn phiên**. Nhịp trình bày trung vị trong cửa sổ này gần 60 Hz, nhưng vẫn có jank; chưa đạt 60 FPS ổn định mọi khung hình. gfxinfo gồm render nội dung/banner mẫu, không chỉ animation. Missed Vsync là bộ đếm gfxinfo, không phải phép đo độc lập số frame bị bỏ hiển thị.

Không hiệu ứng chỉ vẽ 184 frame, bỏ cập nhật pixel trong lúc kéo; phần lớn frame còn lại liên quan thay nội dung. Vì mẫu số khác hẳn chế độ có animation, không dùng riêng tỷ lệ 48,91% để xếp hạng mức mượt hay gọi đó là 48,91% thao tác thất bại. Cả 30 lần điều hướng của chế độ này đã qua. Chuyển tức thì vẫn có chi phí layout/render nội dung; p95 44 ms chưa được loại bỏ.

Lần đo 3D đầy đủ trước chính sách ARMv7 ít RAM có 408/950 frame janky (42,95%), render p95 48 ms và khoảng trình bày p95 33,40 ms. Đây là lý do dùng chuyển động phẳng trên Samsung. Đây không phải đối chứng A/B cùng hiệu ứng với hàng Sách 3D tự giảm ở bảng cuối. Số đo cũ hơn dùng injector chờ từng MOVE cũng không được dùng làm đối chứng vì chính bộ đưa sự kiện làm chậm thao tác; injector hiện dùng lịch thời gian thực và MOVE bất đồng bộ.

Debug USB đã hoàn tất 30 lần chuyển chương 2 → 32. Thời gian callback hoàn tất animation p50 298 ms, p95 336 ms, tối đa 351 ms. Open-to-ready p50 40,6 ms, p95 301,1 ms. Đây là số đo development, không phải thời gian tải mạng production hoặc thời gian khung hình release.

Mã cuối cấu hình settle 200–320 ms theo vận tốc (Không hiệu ứng/Reduce Motion: 0 ms). Chưa đo tách riêng end-to-end callback latency của APK release cuối khỏi thời gian USB/app_process/UIAutomator; không dùng thời gian script làm độ trễ ứng dụng. Các tệp raw cục bộ của lượt cuối: `.cache/page-turn-delivery-chapters-profile.json`, `.cache/page-turn-delivery-{book,slide,none}-profile.json` và `.cache/page-turn-delivery-native-*.json`. APK QA SHA-256: `12B38CF35C77DB902BEB83B1C98FCA7EBDAC1D726D64CF329C14595F3D678112`.

APK QA cuối đã cài cập nhật lên Samsung bằng `adb install --no-streaming -r`, giữ dữ liệu. Cả 12 ca native đã qua: ACTION_CANCEL, kéo ngắn, kéo ngược, đa chạm, vuốt chậm, vuốt nhanh, vuốt dồn khi đang chuyển, lùi trang, chạm hai mép, nút Trang sau, kéo dọc vượt cuối/đầu chương và cuộn vùng bình luận. Ca kéo dọc xác nhận cuộn thường tới cuối không chuyển; kéo tiếp chuyển đúng chương sau, kéo xuống từ đầu về đúng chương trước. Vùng bình luận không chuyển chương. Ca ACTION_CANCEL đã được xác nhận sửa trên máy thật, không chỉ unit test.

Bản production cuối đã mở truyện công khai có chương dài 25 trang trên Samsung, thử cuộn hai chiều bằng sáu cử chỉ thật, giữ nguyên chương, và kiểm tra đổi chế độ ở trang 13/25 cùng 25/25. Các lần lật trang 2 → 25 của chương thật cũng đã được đối chiếu từng bước ở vòng trước. Dữ liệu ứng dụng được giữ bằng cài cập nhật, không uninstall/clear data. Bản bàn giao để Trượt mượt cho Samsung.

Chưa xác minh đầy đủ mạng yếu/VIP/mua chương/offline có bản quyền/TTS liên tục và chạy nền trên tài khoản thật, hiệu năng riêng của chương cực dài 500.000 ký tự trên Samsung, cùng 3D trên ARM64. Không có cam kết hết jank trên mọi thiết bị.

## Tái chạy Android QA

1. Bật USB debugging, giữ máy mở khóa; build/cài **release demo** cho bài tự động nhiều chương, giữ dữ liệu bằng adb install --no-streaming -r.
2. Chạy tests/android/prepare-reader-touch.ps1 với JAVA_HOME=JDK 17 và ANDROID_HOME=SDK có platform/build-tools 36. Công cụ Java chỉ đưa vào /data/local/tmp, không sửa dữ liệu app.
3. Mở reader demo, để thanh điều khiển hiện. Dùng READER_EFFECT=book/slide/none rồi chạy node tests/android/reader-release-usb.mjs pages 30. Script chọn chế độ/hiệu ứng qua giao diện, xác nhận radio đã chọn, gửi input Android và đối chiếu từng trang/chương bằng UIAutomator.
4. Chạy chapters 30, boundary, comments, back, edges, buttons, reverse, multi, cancel, short, slow, fast, burst. Với chương dài: chọn chapters 0 rồi longscroll; chọn pages 0 rồi modeposition tại trang giữa/cuối để kiểm tra giữ vị trí qua đổi chế độ. ADB và ANDROID_SERIAL có thể ghi đè bằng biến môi trường. NATIVE_REPORT chỉ định tệp JSON cục bộ.
5. Để đo hiệu năng, cấu hình bằng pages 0, rồi chạy node tests/android/reader-profile-usb.mjs 30; đặt READER_EFFECT đúng chế độ. Dùng chapters 0 và READER_PROFILE_MODE=chapters để đo chuyển chương. Bộ đo không gọi UIAutomator giữa các lần chạm; thu gfxinfo/SurfaceFlinger trước khi đọc cây giao diện cuối. Các ca chức năng riêng ở bước 3–4 đối chiếu từng thao tác.
6. Công cụ development tests/android/reader-usb.mjs dùng Hermes chỉ đọc để kiểm tra thứ tự và callback timing; cần Metro USB reverse 8081. Không dùng kết quả debug thay cho profile release.

touchAndAutomationMs/inputThroughReadyMs gồm khởi động app_process, gửi sự kiện và chờ/đọc UIAutomation hoặc polling. Không coi các số này là độ trễ animation của ứng dụng. gfxinfo ghi frame thực; các mẫu có thể gồm cả render trang mới và banner mẫu, không chỉ transform.

## Tệp chính

APK production ARMv7 đã build thành công, giữ tại `.cache/artifacts/chuong-page-turn-release-armv7.apk` (không đưa vào Git). SHA-256: `561355577518F30BEF60779DA6988F219DA9E922696F3A6B0270C36EDAAD309A`. Bản sao đường dẫn ASCII để cài USB: `D:\ChuongAndroid-20261016\chuong-page-turn-final-production-armv7.apk`. Manifest hash của 14 tệp đầu vào được lưu cục bộ cùng APK; tất cả khớp workspace tại thời điểm build. APK demo QA được tạo riêng với cùng mã nguồn để thử nhiều chương, không dùng thay APK production.

Đã cài lại production lên Samsung sau toàn bộ QA, đối chiếu SHA-256 của base.apk trên máy trùng hash trên. Reader mở truyện công khai, cuộn chương dài hai chiều thành công rồi khôi phục đúng 25/25, tiến độ 100%, với Trượt mượt. Log cục bộ: `.cache/page-turn-delivery-production-longscroll.json`, `.cache/page-turn-delivery-production-position-restored.json`; ảnh: `.cache/artifacts/chuong-page-turn-final-production.png`.

- app/reader/[bookId].tsx, app/settings/reading.tsx, app/_layout.tsx.
- components/ReaderMotion.tsx và ReaderMotion.native.tsx; ReaderPressable.tsx và ReaderPressable.native.tsx.
- lib/pageTurn.ts, lib/readerPagination.ts, lib/readerPerformance.ts.
- services/storage.ts, types/index.ts, package.json và package-lock.json.
- tests/page-turn.mjs, tests/web/reader-performance.spec.ts và tests/android/*.

## Tài liệu đối chiếu

- [Expo SDK 54 Reanimated](https://docs.expo.dev/versions/v54.0.0/sdk/reanimated/).
- [Reanimated performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/).
- [Static feature flags và giới hạn hit testing](https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/).
