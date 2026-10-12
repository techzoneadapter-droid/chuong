# Phase 4B — staging runbook (DRAFT retention)

Không lệnh nào trong tài liệu đã deploy vào Supabase. Local PostgreSQL/crypto fixtures không thay staging remote. Không dùng project production `lwchpifeahyuoajeidsa` hoặc wallet thật.

## Chuẩn bị staging riêng

1. Xác nhận project URL/ref không phải production, backup staging, so sánh lịch sử migration và diff schema/FK. Apply theo thứ tự `202610120001` tới `202610120004` trên staging sau review. FK tài chính CASCADE được chuyển RESTRICT, không sửa số dư. Tạo hai reader fixture, một author có truyện/gift/payout/store purchase và một admin, tất cả là dữ liệu test.
2. Deploy đồng bộ iap-verify, subscription-verify, iap-events với shared storeEnvironment và `IAP_ENVIRONMENT=sandbox`; dùng sandbox products/credentials. Không public server secret. `iap-events` không dùng gateway Supabase JWT vì store không gửi token này: handler xác minh Google OIDC đúng issuer/audience/service email; Apple notification chỉ dùng hint và fresh Server API lookup. Cả webhook và verifier đều kiểm tra environment trước cấp/revoke quyền. Không tắt JWT gateway ở purchase/subscription verifier.
3. Deploy admob-ssv/shared helper. `verify_jwt=false` chỉ cho callback này, vì Google ECDSA là authority. Secrets `ADMOB_SSV_AD_UNITS` là danh sách giá trị `ad_unit` callback đúng console, `ADMOB_SSV_REWARD_ITEM`, `ADMOB_SSV_REWARD_AMOUNT`, service role/URL staging. SDK customData/userId cùng là session UUID server cấp, không email/user UUID. Reward fixed 10 tại SQL, không lấy giá trị callback làm số dư.
4. Giữ client `EXPO_PUBLIC_ADS_MODE=test`. Google test units có thể không gửi callback về endpoint của riêng app: callback earned không được cộng tiền. Dùng AdMob console verifier và signed fixtures để QA SSV; không bypass signature hoặc cộng tiền để giả PASS. Live ad units chỉ owner bật sau kiểm thử riêng.

## Xóa tài khoản có kiểm soát

Migration bổ sung queue/status pending/processing/blocked/completed, own status RPC, admin queue, lease UUID 30 phút, eight evidence steps, completion policy guard + auth absence. UI `/admin/deletions` dùng RPC, client không sửa trực tiếp queue. Một yêu cầu đang processing không được operator khác claim; lease hết hạn mới retry. Request sống sau auth deletion để lưu audit. Bằng chứng dùng mã hồ sơ nội bộ, không email/token/ngân hàng; trường có giới hạn độ dài.

**Chưa có policy/SLA được owner duyệt. Không xóa auth của tài khoản tài chính.** profiles/auth, authors/books và financial graph có cascade/restrict; cần kế hoạch pseudonymization theo retention được duyệt, không bỏ FK để ép xóa. Owner quyết định retention version; service role chỉ set `policy_version` sau legal review và kiểm tra inventory. Admin không thể tự cấp approval qua app.

Checklist tám bước bắt buộc:

1. `retention_review`: legal holds/retention, phạm vi yêu cầu, chính sách version đã duyệt.
2. `wallet_and_payout_review`: snapshots low/high balance, purchases/subscriptions/refunds, gifts, author VND revenue/payout/KYC; không hủy/xóa ledger hoặc đổi số dư để qua FK. Tách/tombstone identity theo policy có migration đã review; pseudonymous UUID vẫn là dữ liệu cần bảo vệ.
3. `ugc_and_rights`: tác giả/books/chapters/comments/reviews/reports, quyền độc giả/bản quyền, hide/remove/anonymize có audit và quyền tài chính liên quan.
4. `personal_data`: profiles, library/progress/bookmarks/download licenses, reading/analytics, follow/block/privacy/notifications; kiểm kê bảng mới không nằm trong fixture.
5. `storage`: profile-avatars/author-avatars/book-covers và ảnh/ZIP/chapter files thực tế, xóa qua Storage API theo object IDs đã inventory; không chỉ DELETE storage.objects.
6. `devices_and_providers`: push devices/queue/receipts, provider deletion theo contract, local cache/offline trên từng thiết bị và khi sync; không hứa wipe remote device chưa kết nối.
7. `auth_sessions`: revoke access/refresh, remove identity/MFA; raw auth delete chỉ sau retention-safe schema/plan. Test JWT cũ không còn đọc/ghi sau xử lý.
8. `completion_notice`: gửi thông báo theo contact được duyệt trước khi xóa endpoint liên lạc, lưu reference; báo rõ phạm vi retained/legal basis/time. Không tự gửi email trong audit.

`complete` chỉ thành công khi đủ 8 bằng chứng, có policy_version và auth identity không còn. Queue không thực hiện bước xóa thay operator và không chứng minh provider/local cache đã được purge. Do chưa có policy/remote staging/fulfillment integration, **H1 vẫn là release blocker**, không coi UI completed là phép thay thế kiểm chứng dữ liệu. Dùng `block` khi thiếu policy/retention plan; request của user vẫn được giữ.

## Ma trận staging bắt buộc

- Deletion: hai users xem được duy nhất request của mình; anon/reader không claim admin; repeated request same ID; concurrent/stale lease; missing evidence/policy/auth blocks completion; tài khoản tài chính raw auth delete bị RESTRICT, ledger và balances không đổi; author book/gift/payout không mất; test full approved fulfillment + completion notice + old JWT + storage/provider/cache sau khi có policy.
- Billing: valid/pending/canceled, wrong package/SKU/account/environment/quantity, forged token, duplicate transaction/concurrent callback; restore empty/expired/refunded, renewal/grace/hold/revoke/refund reversal; old events không cấp lại quyền sai. Store console sandbox và exact native binary mới cho kết quả end-to-end.
- SSV: bad signature/key/query/ad unit/item/amount/session/expiry, repeat tx và tx reused across sessions; callback failure không award; SDK earned/close/error không mutation; UTC midnight, delayed SSV, consent denied/revoked, VIP banner hidden và rewarded chỉ user chủ động chọn.
- UGC: active approved terms shows exact server text; old version/DRAFT không accept; own acceptance unique; another user cannot spoof; authors/books/chapters/comments/book_reviews và Storage avatar/cover uploads require latest acceptance. Chạy staging Storage API thực tế trước public release.

Build chỉ sau staging gate: `npm ci`, `npm run test:readiness`, Expo checks + native export, EAS preview APK trên Samsung trước; giữ SDK54/RN0.81.5/Expo dev-client/IAP/Ads pins. Sau smoke Development Build, dùng EAS profile release cho AAB/IPA sandbox/test ads, Internal Testing/TestFlight, không auto-submit production. Store/policy/device/signing gates trong RELEASE_READINESS vẫn áp dụng.

Edge types: cài Deno CLI hoặc đặt `DENO_BINARY` tới executable rồi `node scripts/check-edge-functions.mjs`. Script dùng declarations Supabase chính thức trong node_modules + version SDK đã lock, chỉ typecheck; runtime imports không đổi. Cần canonical `deno check`/staging deploy khi JSR registry truy cập được.
