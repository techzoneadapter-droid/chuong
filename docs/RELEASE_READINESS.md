# CHƯƠNG — Phase 4A / 4B Release Readiness

Ngày kiểm toán: **12/10/2026 (Asia/Saigon)**. Repository: `techzoneadapter-droid/chuong`.
Nhánh bàn giao: `release/chuong-v1-readiness`.

**Kết luận: đã sửa source và chuẩn bị cấu hình kiểm thử phát hành; chưa đủ bằng chứng để ký duyệt native release hoặc phát hành production.** Các mục High bên dưới phải đóng trước production. Không thực hiện mua hàng thật, deploy Supabase, migration production, gửi store submission hoặc thay đổi dữ liệu người dùng thật.

Báo cáo này thay báo cáo Phase 4L cũ. Những số liệu production ngày 04/10 trong lịch sử Git không được coi là kết quả kiểm tra hiện tại.

## Phase 4B — trạng thái hiện tại

Owner xác nhận **chưa có staging riêng và chưa có chính sách/contact/retention đã phê duyệt**. Vì vậy chưa thể đóng toàn bộ High hoặc ký duyệt release. Không tạo staging bằng production credentials, không apply migration/deploy backend, không thử mua/quảng cáo thật. Nhánh bắt đầu sạch tại commit Phase 4A `9ff704d`, tiếp tục cùng release branch; không lặp lại các thay đổi Reader/TTS Phase 4A.

### Lỗi đã đóng trong source / local fixtures

| ID | Thay đổi thực tế | Bằng chứng / giới hạn |
| --- | --- | --- |
| B1 | RPC `claim_rewarded_ad_bonus` chỉ đọc trạng thái, không còn mint Linh Thạch; client earned callback chỉ poll trạng thái | Migration 202610120002, DB thử trực tiếp RPC không tăng balance. Backend deployed cũ chưa thay đổi. |
| B2 | AdMob SSV Edge Function xác minh ECDSA SHA-256/DER với public keys Google, giữ nguyên raw query, reject params trùng/unsigned suffix, allowlist unit/item/amount, bind session server UUID; service-only credit, transaction unique + session lock + day claim + expiry | Crypto ephemeral fixtures và PGlite replay/cross-session/day guards; chưa callback console/native thực tế. Test ad units vẫn được giữ, không bypass SSV khi test unit không gửi callback. [Cơ sở triển khai Google SSV](https://developers.google.com/admob/android/ssv). |
| B3 | Webhook Google purchase/subscription và Apple transaction kiểm tra sandbox/production từ fresh lookup trước mutation, đồng bộ verifier | Tests pending/canceled/account/SKU/bundle/transaction mismatch/revoked/expired, cross-environment lookup. Không giả kết quả RTDN/store sandbox end-to-end. |
| B4 | Financial FK cascade chuyển RESTRICT cho wallet/accounts/transactions/gifts/revenue/payout graph; queue xóa sống sau auth removal; status RPC + admin queue/action + lease 30 phút + eight evidence/policy/auth completion guards | Migration 202610120003; `/admin/deletions`; own status, admin ACL, no duplicate/stale claim, missing-policy/auth denial, local completion của account không có tài chính. Không tự xóa tài khoản tài chính hoặc đổi số dư. |
| B5 | App/web `/delete-account` hiển thị trạng thái đã ghi nhận sau reload, có refresh; xác minh qua auth.uid, một request/user | Browser + RLS fixtures. Fulfillment, SLA, provider/storage/cache purge, completion delivery cần quy trình owner/staging; H1 còn mở. |
| B6 | Trang `/privacy`, `/terms` và liên kết Settings/deletion; versioned Terms owner-approved mới được accept, server lưu own acceptance idempotent; approved text immutable; trigger bảo vệ author/book/chapter/comment/book_review và avatar/cover Storage | Migration 202610120004 không activate policy. Public trang DRAFT; terms active hiển thị exact server text. Chính sách và disclosures tại [PRIVACY_STORE_DISCLOSURES_DRAFT.md](PRIVACY_STORE_DISCLOSURES_DRAFT.md). Admin reports/detail đã có, không tạo giao diện trùng. |
| B7 | PostCSS 8.5.29 cùng major; uuid 11.1.1 chỉ trong xcode config tooling, giữ CommonJS v4 | 13 finding names biến mất trong online audit: 44 → 31 (23 high/8 moderate/0 critical). Không đổi Expo/RN/IAP/Ads/dev-client. [Triage từng finding](DEPENDENCY_SECURITY_PHASE4B.json). Những finding OPEN chưa được chấp nhận/miễn trừ. |
| B8 | Form fields có accessibilityLabel; rewarded load timeout không còn cắt video ở 20 giây (20s load, 180s show); thêm regression và CI blockers | Giữ các script Expo Live Preview LAN/port 3000 và pins SDK54/RN0.81.5. Cần QA Samsung bằng Development Build hiện hữu/exact binary, chưa đo máy thật. |

### High còn mở sau Phase 4B

- **H1:** có intake/status/admin workflow và retention guard; chưa có retention-safe pseudonymization/fulfillment integration, thời hạn, contact/completion process, public deletion URL, remote staging. Không thể xóa account có tài chính bằng auth cascade. Xem [STAGING_RELEASE_BLOCKERS.md](STAGING_RELEASE_BLOCKERS.md).
- **H2:** có policy pages và backend Terms acceptance/storage gate; chưa owner-approved Privacy/Terms, Data Safety/App Privacy, legal contact/audience/retention hoặc URL HTTPS public.
- **H3:** chưa signed AAB/IPA, EAS/store signing credentials, resolved native/16 KB/iOS privacy archive và native Samsung/iOS QA. JS export không đóng mục này.
- **H4:** exploit cấp reward từ client đã sửa trong source; chưa deploy SSV/migration staging, configure AdMob callback/allowlist/reward fields, UMP geography/device QA. Backend production cũ vẫn cần migration review trước rollout.
- **H5:** bổ sung webhook environment guard và negative tests; chưa store products/console/license testers, RTDN/Apple sandbox refund/renewal/restore thật, staging deploy và kiểm thử event ordering trên subscription mới nhất.
- **H6:** có hướng dẫn inventory từng truyện/dịch/bìa và luồng báo cáo/admin hiện hữu; chưa thấy hợp đồng/chứng cứ licensing, scope/expiry/takedown thực tế. Không gán quyền hợp pháp cho catalog.
- **H7:** 31 dependency findings còn OPEN. braces/node-forge/sprintf-js latest vẫn nằm trong vulnerable range; image-size 2 có API khác Metro 1.x; decode-uri-component bản vá mới là ESM, query-string pinned dùng CJS. Không ép override thiếu tương thích, không nâng native SDK hoặc audit fix --force. Xem JSON triage; cần review/patch có chứng cứ trước release.

Critical C0 và Medium/Low của Phase 4A vẫn giữ, chưa có live production/device/security evidence để đóng. Những mục B1–B8 là đóng lỗi source cụ thể, **không có nghĩa các High H1–H7 đã đóng hoàn toàn**.

### Kiểm thử Phase 4B

Môi trường local Windows/Node 24, Chromium backend mock/PGlite, không dùng dữ liệu thật. `npm ci --ignore-scripts` cài 874 packages từ lock; sau override uuid chạy npm install --ignore-scripts, final npm ci dry-run/offline xác nhận lock nhất quán. Expo install check PASS; Expo Doctor PASS 18/18. Route types được Expo tạo lại khi thêm routes mới.

| Bài kiểm thử Phase 4B | Kết quả cuối |
| --- | --- |
| TypeScript, unit, UI-copy, admin JS syntax, release source audit | PASS `npm run test:readiness`; 833 static checks. |
| Database/economy/followed/release/author/free preview/deletion | PASS; migrations mới trên PGlite, low/high currency đúng, ledger/gifts/payout không bị cascade, Reader/VIP/RLS giữ nguyên. Không phải full remote migration replay; engagement metrics là zero-activity stub trong wallet fixture. |
| Blocker regression | PASS real ephemeral ECDSA/DER, raw signature tamper/duplicates/suffix/unit/reward/session, replay/expiry/cross-session uniqueness; deletion lease/ACL/status/policy/auth/evidence; latest Terms version + immutability + author/book/chapter/comment/book_review/cover Storage gates. |
| Store verifier/webhook lookup mocks | PASS pending/canceled/expired/revoked, mismatched environment/account/SKU/bundle/transaction; negative states không cấp entitlement; restore regression giữ nguyên. Không có store transaction thật. |
| Browser demo/artwork/admin | PASS 11/11, 1 intentional skip (library backend-only); policy/deletion discovery, anonymous admin denial, 20+ routes, Reader/TTS, 500-entry shelf, artwork, admin controls. |
| Browser backend | 45 PASS lượt đầy đủ; test deletion/status reload/approved Terms PASS riêng sau sửa timeout (7.1s). Tổng 46 bài backend duy nhất PASS; không bỏ assertion. Tổng Phase 4B browser 57 PASS + 1 intentional skip. |
| Android/iOS/web exports | PASS, `.cache/release-export-phase4b`; Android 5,645,619 bytes, iOS 5,647,571 bytes; web entry 3,011,218 bytes. SHA256: [RELEASE_BUNDLE_MANIFEST_PHASE4B.json](RELEASE_BUNDLE_MANIFEST_PHASE4B.json). Không phải AAB/IPA. |
| Edge Function Deno typecheck | PASS cả SSV/events/consumable/subscription với official installed Supabase declarations và locked JS SDK. Canonical JSR fetch bị HTTP 403 trong môi trường này; dùng import map local, không sửa runtime imports. Sửa BufferSource typing và generic ReturnType webhook bị suy ra unknown/never. Reproduce: `DENO_BINARY` trỏ Deno CLI rồi `node scripts/check-edge-functions.mjs`. Chưa chứng minh deploy Edge runtime. |
| Native signing/install/store sandbox/SSV console/remote staging/provider purge/Samsung Live Preview | NOT RUN. Owner chưa có staging/policy; không deploy database/Edge, không tiền/quảng cáo production. |

Lượt QA đầu có lỗi locator trùng title/link trong Expo navigation và timeout tổng của test nhiều route/reload; sửa locator chính xác + timeout 60s, chạy lại thành công. Wallet fixture đầu thiếu cultivation metrics/tables, đã bổ sung đúng fixture và chạy lại database suite PASS. Không lấy các lượt thất bại làm PASS.

Không thay đổi app.json/app.config/eas/start/dev/native pins trong Phase 4B. Một probe xcode generateUuid ban đầu thiếu fixture project hash, sửa fixture cho đúng: CommonJS v4 sinh ID 24 hex chars. Không coi probe đó là iOS prebuild/archive.

## Phase 4A — bằng chứng nền đã hoàn thành

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
