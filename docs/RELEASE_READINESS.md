# CHƯƠNG — Phase 4A Release Readiness

Ngày kiểm toán: **12/10/2026 (Asia/Saigon)**. Repository: `techzoneadapter-droid/chuong`.
Nhánh bàn giao: `release/chuong-v1-readiness`.

**Kết luận: đã sửa source và chuẩn bị cấu hình kiểm thử phát hành; chưa đủ bằng chứng để ký duyệt native release hoặc phát hành production.** Các mục High bên dưới phải đóng trước production. Không thực hiện mua hàng thật, deploy Supabase, migration production, gửi store submission hoặc thay đổi dữ liệu người dùng thật.

Báo cáo này thay báo cáo Phase 4L cũ. Những số liệu production ngày 04/10 trong lịch sử Git không được coi là kết quả kiểm tra hiện tại.

## 1. Bảo toàn source và các lỗi đã sửa

- Working tree sạch khi bắt đầu tại `1ec1e9a`, nhánh `feature/reader-gestures-free-preview`, ahead remote feature 1 commit.
- Fetch origin thành công. Feature và main phân kỳ 8/6 commit. Tạo nhánh release từ toàn bộ feature hiện có, merge `origin/main` tại `9643ff4` **vào nhánh release**, không merge vào main. Merge không có xung đột, bổ sung 24 dòng admin ZIP/VIP/free preview; giữ toàn bộ lịch sử Reader/TTS.
- Không reset, force push, xóa feature, sửa dữ liệu production hoặc nâng SDK/native package.
- Sửa tên native thực sự bị lỗi encoding `CHÆ¯Æ NG` thành `CHƯƠNG`; sửa mô tả chọn ảnh. Giữ package/bundle ID `vn.chuong.app`, version `1.0.0`.
- Tủ sách hiển thị ngay sau truy vấn sách/tiến độ theo batch; không còn chờ metadata chương của mọi truyện. Chỉ tải metadata để tinh chỉnh phần trăm cho sách có tiến độ. Lỗi metadata một sách không che toàn bộ tủ; giữ request generation guard khi đổi tài khoản/route. Không giả định số chương liên tục; hiển thị dấu chờ cho tổng tiến độ chưa xác định.
- Reader dùng trạng thái Internet reachable để mở bản offline có giấy phép còn hạn khi mạng không tới được backend. Unknown connectivity vẫn thử server. Không đổi kiểm tra khóa VIP, giấy phép offline, checksum, catalog cache/LRU hay giới hạn prefetch.
- TTS giữ Android language `vi`, iOS/web `vi-VN`, giới hạn input native, timeout và cancellation. Chặn engine đã xác định chỉ có giọng ngoại ngữ trên cả web. Không đợi browser `voiceschanged` lúc bấm Play khi inventory chưa sẵn sàng; lưu trạng thái đã dò để tránh lặp lại chờ native; giữ nút thử lại giọng. Danh sách rỗng vẫn thử giọng mặc định tiếng Việt, không chứng minh hệ điều hành có giọng Việt thực tế.
- Khôi phục VIP xử lý cả danh sách rỗng và lỗi, luôn thoát spinner; yêu cầu Restore chủ động xác minh lại transaction đã từng xử lý. Linh Thạch bỏ qua callback SKU thuê bao/khác catalog, từ chối mua khi chưa có user và chống callback đồng thời cho cùng transaction.
- Backend `iap-verify`, `subscription-verify`, `iap-events` yêu cầu server secret `IAP_ENVIRONMENT=sandbox|production`. Hai verifier từ chối giao dịch khác môi trường trước RPC cấp quyền/cộng tiền; Apple lookup chỉ dùng endpoint đã chọn. Chưa deploy các thay đổi này.
- AdMob mặc định dùng test App ID và test ad unit, kể cả release build, trừ khi chủ động cấu hình production. Banner/rewarded/bridge dùng chung UMP consent trước init/request; trì hoãn app measurement bằng plugin; banner dùng NPA. Cài đặt có lối mở privacy options khi UMP yêu cầu, cập nhật consent tới banner đang mount. Chưa bật quảng cáo thật.
- Password recovery native dùng `chuong://auth/reset`; chỉ route này được nhận access/refresh token hoặc code, rồi xác minh/exchange với Supabase. Không log token. Phải allowlist URI này trong staging và kiểm thử email thật.
- Bổ sung `/delete-account` trên app/web và entry trong Cài đặt. Xác nhận bằng `XÓA`, không báo đã xóa khi mới tiếp nhận. RPC `request_account_deletion` tự lấy auth.uid, ghi queue idempotent, RLS chỉ đọc yêu cầu của mình; client không thể giả user, sửa status hoặc xóa request. **Đây là intake, chưa có worker/quy trình hoàn tất xóa.** Migration `202610120001_account_deletion_requests.sql` chưa apply vào backend nào.
- Bổ sung nút Báo cáo tác giả ở creator hub, đi tới luồng báo cáo hiện có với đúng author ID.
- Loại quyền camera/microphone từ config vì mọi nơi chỉ dùng chọn ảnh thư viện. Không nâng native dependencies. Thêm direct `expo-linking=8.0.12`, đúng phiên bản transitive có sẵn trong lockfile; đánh giá tác động: khai báo để autolink đúng native module, cần rebuild Development Build.
- Sửa dynamic Expo config theo contract nhận `config`; sửa UI-copy audit dùng fileURLToPath để thực sự quét trên Windows. Thêm runtime/DB/browser regression và CI cho `release/**`, unit, native JS bundles.
- EAS: preview APK/demo/test ads; release AAB/store distribution/staging/test ads; iOS release/production pin Xcode 26 image; remote native version source và autoIncrement. Source native config thay đổi yêu cầu một Development Build mới trước QA; không thể kiểm chứng bằng Expo Go.

## 2. Lỗi và khoảng trống còn lại

| Mức | ID | Bằng chứng / ảnh hưởng | Việc cần đóng |
| --- | --- | --- | --- |
| Critical | C0 | Chưa tái hiện Critical trong local fixtures. Production security không được kiểm toán live trong phiên này. | Không suy ra production an toàn từ test local; audit deployed ACL/RLS/RPC/secret trước release. |
| High | H1 | Xóa tài khoản mới có queue intake; chưa deploy migration, chưa có thời hạn xử lý/nhân sự/worker, thông báo hoàn tất hoặc quy tắc retention. Web route chưa có URL public được xác nhận. | Chốt retention/SLA/contact, deploy staging, xử lý auth + profiles + author/books/UGC + storage + analytics + push + local cache + nhà cung cấp, kiểm thử xóa hai tài khoản và tài khoản tác giả có tiền. Không xóa trực tiếp auth.users khi chưa đánh giá FK cascade và nghĩa vụ giao dịch. |
| High | H2 | Không có privacy policy/Terms URL công khai đã xác nhận, chưa có consent điều khoản trước mọi UGC, chưa có bộ khai báo Data Safety/App Privacy. | Chủ app cung cấp pháp nhân/contact/chính sách, chốt disclosures và enforcement trước upload/comment/review; công bố URL hoạt động, liên kết trong app/store. |
| High | H3 | Chưa có signed AAB/IPA, Gradle dependency resolution, merged manifest, iOS archive/privacy manifests và native device tests. | EAS/store owner credentials; native build/install; xác nhận Billing >=8, 16 KB, SDK/signing, push và crash-free QA. |
| High | H4 | `claim_rewarded_ad_bonus` cấp thưởng qua RPC authenticated trực tiếp, không có AdMob SSV proof. Unique/day chống nhận lặp nhưng không chứng minh xem quảng cáo. | Triển khai SSV với kiểm tra signature/ad unit/user/transaction, idempotency và replay protection trước bật rewarded production; client callback không được làm authority. |
| High | H5 | Chưa xác minh console SKU, license testers, subscription group/base plan, receipt/refund/restore bằng store thật. Verifier/webhook mới chưa deploy staging. | Deploy đồng bộ với IAP_ENVIRONMENT=sandbox trên DB staging riêng; kiểm thử canceled/pending/duplicate/account mismatch/restore/refund/revocation/renewal; tuyệt đối không trộn sandbox wallet với production. |
| High | H6 | Imported ZIP/catalog chỉ có source_type/cam kết tác giả; không có hồ sơ chứng minh quyền cho từng truyện/bìa/dịch. | Kiểm kê quyền sở hữu, hợp đồng cấp phép, phạm vi/quốc gia, expiry, nguồn và takedown trước public listing; không coi nhãn authorized là bằng chứng bản quyền. |
| High | H7 | npm audit online báo 44 findings (24 high, 20 moderate, 0 critical). Phần lớn high đi qua Metro/CLI/build tooling; còn moderate ở URL parsing/linking. Đề xuất npm tự sửa có cả downgrade Expo 44/RN upgrade. | Báo cáo máy đọc: [DEPENDENCY_SECURITY_AUDIT.json](DEPENDENCY_SECURITY_AUDIT.json). Triage từng advisory và reachability, cập nhật JS/tooling có đánh giá, hoặc chấp nhận có bằng chứng; không npm audit fix --force hay tự nâng native/SDK. Không coi audit offline 0 là đã hết lỗi. |
| Medium | M1 | Chưa đo low/mid/high Android/iOS, cold start/RAM/native frames/thermal/battery. | Chạy ma trận thiết bị ở mục 7, lưu raw results và device/build identifiers. |
| Medium | M2 | UGC reports/admin actions có trong source, reader block/mute có; chưa chứng minh block có hiệu lực trên mọi comment/review/catalog hoặc thời gian phản hồi moderation. | Hai tài khoản đối kháng, báo cáo truyện/bình luận/tác giả/review, hide/restore/appeal, kiểm tra anonymous/raw API; phân công moderation/contact. |
| Medium | M3 | Consent/NPA/privacy options có source/tests mock, chưa kiểm thử UMP EEA/UK/US, ATT/IDFA, age gating và SDK disclosures thực tế. | Native test với consent test geography/device IDs; chốt audience/age rating. Không tự gắn nhãn trẻ em chỉ vì source phục vụ demo học sinh. |
| Medium | M4 | Native reset URI vừa bổ sung; email confirmation/reset và push chưa kiểm thử tài khoản staging thật. | Allowlist staging HTTPS + chuong://auth/reset; email link expired/replayed/app killed/foreground; FCM/APNs denied/revoked token. |
| Low | L1 | Artwork icon/splash đã có; store screenshots, feature graphic, mô tả/support URL, accessibility/large fonts/tablet localization chưa hoàn tất. | Chụp từ exact release binary, kiểm tra tên không lỗi encoding và VoiceOver/TalkBack. |
| Low | L2 | Prebuild cảnh báo automatic system UI cần expo-system-ui. | Đánh giá bổ sung đúng SDK trong Development Build riêng; không nâng gói trong audit này. |

## 3. Kết quả kiểm thử

Môi trường: Windows 10, Node 24.19.0, npm 11.17.0; CI giữ Node 22. Database dùng PostgreSQL/PGlite fixtures local, browser dùng Chromium + Expo Metro localhost, request backend được mock. Không dùng tài khoản hay giao dịch production.

| Kiểm tra | Kết quả |
| --- | --- |
| npm ci | PASS, 874 packages từ lockfile; online audit 44 findings. Sau thêm direct expo-linking, lock-only offline xác nhận graph nhất quán, version không đổi. |
| Expo install --check | PASS, dependencies up to date. |
| Expo Doctor | PASS 18/18 sau sửa config và direct linking. |
| TypeScript | PASS tsc --noEmit. |
| Unit/performance | PASS single-flight/retry/user isolation, serialized storage, batching 205 books, offline quotas/checksum/license, sparse navigation/cache/prefetch/gesture/TTS cancellation. |
| Release runtime/store verifier mocks | PASS scoped recovery URLs, consent deny/retry/revoke, VIP restore empty/repeated/failure; cả hai handler verifier từ chối auth/missing config/cross-environment trước mutation. Store APIs/key đều fixtures ephemeral. |
| UI copy + admin web syntax | PASS, quét runtime source thật trên Windows; 4 admin JS files parse. |
| Static release audit | PASS 821 checks tại lượt kiểm tra; đây là source/identity assertions, không phải chứng nhận store. |
| Database tests | PASS database/economy/followed-updates/release-batching/author-releases; free-preview PostgreSQL guest/reader/owner/admin, raw body denial/N boundaries; account-deletion RLS/idempotency/forged writes. Không áp dụng mọi migration bằng một full production replay; cron/storage/auth provider fixtures có giới hạn. |
| Browser demo | PASS 8 tests, 1 intentional skip (library mock-only); 20+ routes, shelf/progress/bookmark persistence, settings, TTS controls, 500-entry virtualization, deletion discovery. |
| Browser artwork + admin | PASS 2/2; ảnh mobile/desktop tải đầy đủ, không overflow; admin preview field lưu đúng và cancel giảm giới hạn không ghi dữ liệu. Tổng browser: 54 passed + 1 intentional skip. |
| Browser backend | PASS 44/44 (2.5 phút): auth/logout, author/editor/autosave/schedule, wallet/VIP/gift, notifications/social/privacy, discovery pagination, Reader/gesture/TTS/default/lock/offline/long chapters, creator report route, shelf slow/failure. |
| Expo export Android/iOS/web | PASS Hermes Android/iOS khoảng 5.63 MB mỗi bundle; web entry khoảng 2.99 MB. Final bundle được kiểm tra lại sau thay đổi cuối. Không phải AAB/IPA. |
| Bundle integrity | SHA-256 và byte sizes lưu tại [RELEASE_BUNDLE_MANIFEST.json](RELEASE_BUNDLE_MANIFEST.json); file export ở `.cache/release-export-final`, chế độ demo/test ads. |
| Android isolated prebuild | PASS trong .cache/native-inspect, không tạo android/ios ở root. app.gradle dùng root SDK catalog; node_modules/react-native/gradle/libs.versions.toml pin compileSdk=36,targetSdk=36. |
| iOS config introspection | PASS tên CHƯƠNG, photo description tiếng Việt, không có camera/mic descriptions, GADDelayAppMeasurementInit=true. Chưa archive bằng Xcode. |
| Native signed binary / thiết bị / EAS credentials / live DB / real store sandbox | NOT RUN, cần tài khoản/môi trường và thiết bị. |
| Toolchain/account chỉ đọc | Expo CLI nhận diện có phiên đăng nhập hiện hữu; chưa xác minh quyền ký/EAS project/store credentials. Không tìm thấy eas/java/adb CLI hay Android Studio tại đường dẫn chuẩn; host Windows không thể archive iOS. `expo whoami` còn phát sinh libuv assertion trên Node 24 sau khi trả identity; CI dùng Node 22. |

Các lượt đầu: sandbox chặn worker/browser (EPERM), sau đó dùng local QA được cho phép. Nhiều Metro cùng biên dịch làm cold compilation vượt timeout; giới hạn 2 workers và tăng thời gian tổng cho smoke nhiều trang. TTS inventory rỗng cũng có regression được sửa, không bỏ assertion hay bỏ bài test. Không lấy các lượt thất bại làm PASS.

## 4. Google Play và App Store

- [Google Play target API](https://support.google.com/googleplay/android-developer/answer/11926878): API 36 cho app mới/update từ 31/08/2026. SDK 54 và native catalog đã phù hợp về source; cần xác nhận AAB manifest actual trước upload.
- [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/) và [changelog](https://expo.dev/changelog/sdk-54): RN 0.81/API 36, hỗ trợ Xcode 26. Giữ Expo ~54.0.20 (lockfile resolved 54.0.37), RN 0.81.5, New Architecture, IAP 5.8.2, Mobile Ads 16.3.4.
- [Apple requirement](https://developer.apple.com/news/upcoming-requirements/?id=04282026a): từ 28/04/2026 cần Xcode 26+ và iOS 26 SDK+. EAS release pin macos-sequoia-15.6-xcode-26.0 theo [Expo images](https://docs.expo.dev/build-reference/infrastructure/); chưa chứng minh bằng IPA/archive log. Minimum deployment OS không phải SDK build version.
- [Billing deprecation](https://developer.android.com/google/play/billing/deprecation-faq): phải kiểm tra Billing >=8 trong resolved native graph và merged manifest, không suy ra từ tên expo-iap. Pin OpenIAP google 3.6.2/apple 3.6.1; [Maven POM đúng pin](https://repo1.maven.org/maven2/io/github/hyochan/openiap/openiap-google/3.6.2/openiap-google-3.6.2.pom) khai báo Billing 9.1.0, đủ mức phiên bản theo metadata. Đây là bằng chứng bổ sung, không thay Gradle dependency report/compiled manifest và QA Development Build.
- [16 KB](https://developer.android.com/guide/practices/page-sizes): kiểm tra mọi .so và ZIP alignment của signed artifact, cài trên Android 16 KB; RN hỗ trợ không bảo đảm mọi SDK quảng cáo/IAP tương thích.
- [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111): cần in-app path và public web URL; `/delete-account` có source nhưng chưa có public deploy/fulfillment. [Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app/) cho phép xử lý thủ công có thông tin thời gian/hoàn tất; intake hiện chưa đáp ứng trọn quy trình.
- [Google UGC](https://support.google.com/googleplay/android-developer/answer/9876937): cần acceptance Terms, report/block và moderation; các khoảng trống H2/H6/M2 còn mở.
- [Google Payments](https://support.google.com/googleplay/android-developer/answer/10281818): VIP/Linh Thạch đi qua native store; không thấy link ngân hàng/checkout bên ngoài trong các purchase screens/services đã rà soát. Links quản lý/hủy thuê bao ở deletion route không phải payment checkout. Apple IAP và disclosure phải được store review xác nhận cho mô hình quà/tác giả.

## 5. Cấu hình tài khoản và dữ liệu cần hoàn tất

1. Xác nhận quyền sở hữu EAS projectId e32bd9ff-b581-499c-8f39-eb786810d3cb và hai store app records với ID vn.chuong.app. Không giả định projectId trong file đồng nghĩa có quyền build.
2. EAS preview environment: Supabase staging URL/key public riêng; release config từ chối thiếu staging hoặc URL project production cũ. Không đặt service role, Apple private key hay Google service JSON trong EXPO_PUBLIC_*.
3. Staging: apply migration mới sau backup/review và đối chiếu migrations đã deploy, triển khai verifier/shared helper/webhook đồng bộ; secrets server IAP_ENVIRONMENT=sandbox và store verifier keys/product IDs. Không chạy những lệnh này trên production trong audit.
4. Play signing/upload keystore + Play App Signing, developer verification/account type, license testing, SKU/base plans, API service account permissions, Pub/Sub RTDN audience/email.
5. Apple Developer team, distribution certificate/provisioning, App Store Connect app/subscription group/products, IAP key/issuer, sandbox testers, TestFlight review information/demo account.
6. FCM v1 và APNs; notification permission và push links. AdMob console UMP messages/test devices/test geography; giữ test ads, không thêm live credentials tự động.
7. Support contact, pháp nhân, privacy/Terms/retention URL, deletion SLA/public URL và completion process; nội dung/bản quyền; reviewer account và age/content rating.
8. Data inventory cần owner xác nhận: email/auth IDs, username/avatar/bio, UGC/truyện/bìa/review/comments, reading activity/analytics/shelf, relationships/block/privacy, push device tokens, purchases/subscriptions/wallet/gifts/payout bank data, ads identifiers/diagnostics. TTS truyền đoạn văn cho system engine; engine có thể tải voice/dùng network. AI cover/translation Edge Functions gửi nội dung cho provider theo cấu hình. Khai báo collection/sharing/linkage/retention tương ứng, không tự xác nhận app không thu dữ liệu.
9. Kiểm tra native merged permissions: INTERNET, billing, AD_ID, notification/vibration, legacy external storage và network theo SDK. Camera/mic bị remove, không xin location/contacts theo app source. Introspection chưa thay final manifest/PrivacyInfo.xcprivacy/SDK signature/export compliance review.

## 6. Tạo Android AAB và iOS IPA

Trước build: đóng blocker môi trường staging, xác minh EAS identity/credentials, không sửa ID để lách signing. Preview demo không kiểm tra login/billing backend. Release store build mới cần staging thật cho auth/IAP sandbox.

```sh
npm ci
npx expo install --check
npx expo-doctor
npm run test:readiness
npx expo export --platform all --max-workers 2 --output-dir .cache/release-export
npx eas-cli whoami
npx eas-cli project:info
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile release
npx eas-cli build --platform ios --profile release
```

`preview` Android tạo APK; `release` Android tạo signed AAB để tải vào Play Internal Testing. `release` iOS distribution=store tạo IPA để tải App Store Connect/TestFlight; không cài trực tiếp như ad-hoc IPA. EAS remote autoIncrement giữ build number/versionCode tăng; đối chiếu giá trị trong store trước build và không đổi version metadata trong console tùy tiện.

Download artifact từ EAS build page và lưu checksum/build ID/commit. Android: đọc manifest targetSdk/package/version/signing, chạy Gradle dependency report và kiểm tra Billing, bundletool/page alignment + 16 KB install. iOS: đọc archive build log Xcode/SDK, bundle ID/version, entitlements/provisioning, privacy manifests và dSYM. Không coi expo export là bước ký binary.

Sau QA có thể upload thủ công đúng artifact vào **testing track/TestFlight**, xem lại track và tài khoản trước xác nhận. Không dùng submit production/auto-submit hoặc profile production khi Critical/High chưa đóng. Production profile chỉ là cấu hình chuẩn bị, không phải phê duyệt phát hành.

## 7. Kế hoạch Internal Testing, Closed Testing, TestFlight

- Internal: reviewer/test accounts trên staging riêng, test ads, store sandbox. Smoke first launch/auth/email reset, home/search/library, sparse/long Reader, rapid chapter gestures/font/page/restoration, Vietnamese TTS default/voice retry/pause/stop/sleep/auto-next; quota/airplane mode/reconnect/storage-full, VIP locks/refund/restore, two wallets/gifts, ads deny/accept/revoke/reward failure, author import/schedule, admin authorization/report/hide, push deny/accept/link, request deletion và fulfillment.
- Closed: mở sau internal pass và blocker privacy/UGC/deletion được xử lý. Với [personal accounts mới thuộc diện yêu cầu](https://support.google.com/googleplay/android-developer/answer/14151465), ít nhất 12 testers opted-in liên tục 14 ngày trước xin production access. Xác nhận account type/date trên console; không giả định mọi tài khoản đều áp dụng.
- TestFlight: build bằng Xcode 26/iOS 26 SDK, internal testers trước; external beta review với reviewer credentials, contact, policy URLs, age rating; Apple sandbox subscription/refund/restore và APNs trên exact IPA.

| Tầng thiết bị | Android mục tiêu | iOS mục tiêu | Đã đo trong audit |
| --- | --- | --- | --- |
| Thấp | 2–3 GB RAM, CPU cũ, Android 7+ được SDK hỗ trợ | Thiết bị cũ còn hỗ trợ iOS 15.1+ | Chưa |
| Trung bình | 4–6 GB, Android 13–16, mạng yếu | iPhone tầm trung/iOS 18–26 | Chưa |
| Cao | 8+ GB, Android 16; thêm máy/emulator 16 KB | iPhone/iPad mới iOS 26 | Chưa |

Lưu cold/warm load P50/P95, open-to-ready/chapter transition/input latency, native slow/frozen frames, process RSS/peak RAM, 30–60 phút TTS/Reader, background/foreground, pin/nhiệt, deny permissions, interrupted purchase/download. Ngưỡng QA dự kiến cần owner chốt: cached transition <300 ms ở tầng trung bình, phản hồi tap <100 ms, không ANR/crash hay tăng RAM liên tục; mạng chậm có loading/retry rõ và không bỏ qua chương. Đây là mục tiêu, không phải số đo.

Chứng cứ hiện có chỉ là development browser/Node fixtures: shelf 500 entries mount ban đầu 5 rows; Reader 100/500/1201 metadata-only pagination, sparse next chỉ tải bounded body; Node TTS workload 5.19M chars có cooperative yielding nhưng max heartbeat gap thay đổi theo tải máy. Không chuyển các số này thành tuyên bố FPS/RAM/native device performance.

Release rule: chỉ owner ký duyệt production sau CI exact commit, signed binary, deployed staging/security verification, device QA, store billing/push và mọi Critical/High được đóng. Nhánh này được commit/push riêng, không merge main hay phát hành production.
