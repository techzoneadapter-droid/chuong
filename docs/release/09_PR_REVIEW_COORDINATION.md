# CHƯƠNG — Ghi chú phối hợp và review PR đang mở (19/10/2026)

Phạm vi: chỉ xem code và diff qua GitHub; **không chạy AAB, không kiểm thử AdMob live, không sửa Production, không kết luận PR đủ điều kiện merge**.

## PR #5 — AdMob/SSV, 94 tệp thay đổi

URL: https://github.com/techzoneadapter-droid/chuong/pull/5
Trạng thái quan sát: draft, chưa merge.

### Đã nhìn thấy trong diff

- Migration 202610160002_admob_verified_rewards.sql bổ sung bảng session/ticket nhận thưởng, hàm begin_rewarded_ad_session() và confirm_verified_admob_reward(), khóa đường claim_rewarded_ad_bonus() cũ.
- Edge Function admob-ssv xác minh Google ECDSA signature và chuyển yêu cầu tới RPC dùng service_role sau xác minh.
- Dữ liệu giả/trùng, giao dịch đã nhận, tổng số lượt/ngày có chốt phía server trong migration.
- Code client mới chỉ hiển thị "đang chờ Google xác minh", không cộng tiền chỉ bằng client event.
- app.config.js dùng App ID thật khi EAS production và EXPO_PUBLIC_ADMOB_LIVE=true; còn lại dùng sample để test.
- PR này còn sửa nhiều vùng unrelated tới quảng cáo: reader gestures, TTS, offline, hiệu năng, push, package.json. Cần regression toàn bộ.

### Các kiểm tra bắt buộc trước khi coi là đã fix

1. Chủ dự án đồng ý chính sách thưởng **5 Hạ Phẩm/1 quảng cáo/ngày**; DB cũ có thể đang dùng 10, đây là thay đổi chính sách sản phẩm.
2. Review chức năng SSV: endpoint cấu hình AdMob trỏ đúng Supabase, SSL, ký ECDSA thật, key rotation, payload tampering, replay, user binding, timestamp/timezone.
3. Migration phải áp dụng và kiểm thử trên môi trường staging trước Production; không deploy một nửa (source app mới nhưng database cũ/Edge Function chưa bật).
4. Quyền EXECUTE RPC legacy đã bị thu hồi ở database Production; xác nhận bằng truy vấn thử tài khoản thường và audit log, không chỉ nhìn SQL trong Git.
5. Dùng AdMob test callback để kiểm tra transport nhưng **không** coi test callback với dummy ID là bằng chứng cộng thưởng end-to-end.
6. Có bản Android nội bộ chạy SDK thật, đã kiểm thử consent, tải quảng cáo, đóng sớm, lỗi mạng, tài khoản khác, callback đến trễ, không nhận thưởng 2 lần.
7. Chốt Play Store listing, app-ads.txt và AdMob account approved/trusted. Không tự click quảng cáo production.
8. Đánh giá sự tương thích với PR #3 (reader gestures/performance) để tránh mất tính năng hoặc ghi đè phiên bản cũ.

### Vấn đề chưa thể xác minh từ diff

- Phiên bản code đã deployed thực tế trên Supabase.
- Bản AAB thực sự dùng manifest/App ID nào.
- Google thật sự ký và gửi SSV đến endpoint đã deploy.
- Con số doanh thu AdMob hoặc khả năng chi trả Linh Thạch theo quỹ quảng cáo.
- Kết quả test trên nhiều thiết bị Android.

## PR #3 — Reader gestures / performance

URL: https://github.com/techzoneadapter-droid/chuong/pull/3
Chưa coi các sửa đổi của PR này có trong main. Khi review PR #5 với hơn 90 file thay đổi, phải so sánh giao thoa với PR #3 thay vì cherry-pick hoặc merge mù. Kiểm thử đầu/cuối chương, ngang/dọc, TTS, offline và dữ liệu đọc đã lưu.

## PR #6 — Tài liệu Google Play

URL: https://github.com/techzoneadapter-droid/chuong/pull/6
Chỉ bổ sung bản nháp chính sách, Data Safety, nội dung listing và báo cáo. Không tự merge/publish trước khi chủ phát hành duyệt ô thông tin còn trống. Dùng làm đầu vào cho Codex nhưng vẫn phải đối chiếu bản code mới tại thời điểm thực tế.

## Quy tắc ra quyết định

- **Không merge PR chỉ vì CI web xanh.**
- **Không kích hoạt quảng cáo thật cho đến khi consent, callback SSV và refund/entitlement vượt kiểm thử.**
- **Không thay đổi database production bằng PR docs.**
- Bàn giao kèm commit SHA, danh sách migration, rollback plan, native test report và số liệu kiểm thử thực, không đưa lời hứa chung chung.
