# Kết nối CHƯƠNG với Supabase

Ứng dụng vẫn đọc được truyện mẫu, dùng AI/Audio demo và lưu tủ sách trên thiết bị khi chưa kết nối. Không cần khóa API để xem thử.

## 1. Tạo dự án

1. Mở trang quản lý Supabase và chọn **New project**.
2. Chọn tổ chức, đặt tên dự án, mật khẩu cơ sở dữ liệu và khu vực gần người dùng.
3. Chờ dự án sẵn sàng. Mật khẩu cơ sở dữ liệu không được đưa vào ứng dụng.

## 2. Lấy hai thông tin công khai

Trong **Project Settings**:

- Mục **Data API** (hoặc **API**) có **Project URL**.
- Mục **API Keys** có **publishable key**. Có thể dùng khóa **anon** ở phần khóa cũ.

Chỉ dùng publishable/anon key. Không dùng secret/service_role key trong CHƯƠNG.

## 3. Thêm vào cấu hình ứng dụng

Trong phần Environment Variables của môi trường chạy Vibaocode/Vercel/Expo, tạo:

```text
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_KEY
```

Nếu chạy trên máy cá nhân, có thể đặt hai dòng này trong `.env.local` ở gốc dự án. Không đưa file đó lên Git.

Khởi động lại preview sau khi thêm hoặc đổi giá trị. Bản web đã build cần build lại vì Expo đưa các giá trị công khai này vào ứng dụng.

## 4. Tạo cơ sở dữ liệu

Mở **SQL Editor → New query** trong Supabase.

Với dự án mới, lần lượt sao chép toàn bộ nội dung và bấm **Run**:

1. `supabase/migrations/202610020001_phase3a_foundation.sql`
2. `supabase/migrations/202610020002_phase3a_stabilization.sql`

Nếu migration đầu đã được áp dụng thành công, chỉ chạy migration thứ hai. Không chạy lại migration đã chạy. Khi có thông báo lỗi, dừng và giữ lại thông báo để kiểm tra; không tắt RLS.

Cách khác dành cho người dùng Supabase CLI: liên kết đúng dự án, rồi dùng `supabase db push` để áp dụng các migration còn thiếu. Không dùng đồng thời CLI và SQL Editor để chạy lại cùng migration.

## 5. Kiểm tra Storage

Trong **Storage**, kiểm tra ba bucket đã được migration tạo:

- `book-covers`
- `author-avatars`
- `profile-avatars`

Các bucket công khai để hiển thị ảnh; chỉ chủ sở hữu được tải lên/xóa ảnh của mình theo chính sách SQL. Giới hạn ảnh: **5 MB**, JPG/PNG/WebP. Không thêm chính sách cho phép tất cả mọi người ghi.

Nếu bucket chưa tồn tại do quyền của SQL Editor, quản trị viên tạo bucket tương ứng, bật **Public**, đặt 5 MB và ba loại MIME `image/jpeg`, `image/png`, `image/webp`; sau đó kiểm tra lại việc chạy migration và các chính sách trong **Storage → Policies**.

Bìa mới lưu tại `userId/bookId/tên-file-duy-nhất.ext`. Avatar tác giả dùng `authorId/tên-file.ext`; avatar độc giả dùng `userId/tên-file.ext`. Bìa cũ từ Phase 3A vẫn hiển thị; các file dùng thư mục tác giả cũ cần quản trị viên dọn thủ công nếu không còn dùng.

## 6. Cài đặt đăng nhập

Trong **Authentication**:

1. Bật nhà cung cấp **Email** và đăng nhập email/mật khẩu.
2. Giữ **Confirm email** bật cho môi trường thật.
3. Trong **URL Configuration**, đặt **Site URL** là địa chỉ web của CHƯƠNG.
4. Thêm địa chỉ chính xác `https://YOUR_APP/auth/reset` vào **Redirect URLs**. Khi thử local, thêm `http://localhost:3000/auth/reset` (hoặc cổng preview thực tế).
5. Email xác nhận đăng ký quay về Site URL. Email quên mật khẩu mở `/auth/reset` để nhập mật khẩu mới.
6. Cấu hình SMTP riêng trước khi mở cho nhiều người dùng. Email thử nghiệm của Supabase có giới hạn gửi.

Luồng khôi phục mật khẩu hiện dùng web. Trên điện thoại, mở liên kết email trong trình duyệt web của CHƯƠNG. Khôi phục bằng deep link native cần kiểm thử ở bản phát hành sau. Google/Apple chưa bật.

## 7. Thử đăng nhập

1. Mở `/auth/register`, nhập tên, email và mật khẩu.
2. Mở email xác nhận rồi đăng nhập ở `/auth/login`.
3. Mở tab **Tôi**, kiểm tra tên/username/bio; chọn chỉnh sửa và lưu.
4. Tải lại trang: tài khoản vẫn đăng nhập.
5. Thêm truyện vào tủ sách, đọc một đoạn và đánh dấu; mở thiết bị thứ hai với cùng tài khoản để kiểm tra đồng bộ.
6. Chọn quên mật khẩu, mở liên kết và đặt mật khẩu mới; thử đăng nhập lại.

## 8. Thử xuất bản

1. Đăng nhập, mở **Author Studio**, đăng ký bút danh và xác nhận quyền sử dụng nội dung.
2. Tạo truyện, nhập các trường, chọn bìa và xác nhận quyền sử dụng. Truyện được tạo **riêng tư/bản nháp**.
3. Tạo chương, nhập tiêu đề và ít nhất 50 ký tự nội dung. Chờ **Đã lưu**.
4. Bấm **Xuất bản** trong trình soạn thảo chương.
5. Trong quản lý chương, bấm **Công khai** để đưa truyện ra Home/Discover. Có thể chọn **Hoàn thành**, **Tạm dừng**, hoặc **Riêng tư** sau đó.
6. Mở cửa sổ ẩn danh: truyện công khai và chương đã xuất bản đọc được; chương nháp và truyện riêng tư không xuất hiện.
7. Dùng tài khoản thứ hai: không được chỉnh sửa truyện/chương của tác giả đầu.
8. Thử bình luận, trả lời, thích và xóa bình luận của chính mình.

Không có truyện thật được tự động thêm vào Supabase. Một Home trống sau khi kết nối là bình thường cho đến khi tác giả công khai truyện.

## Kiểm tra kỹ thuật khi cần

```sh
npm install
npm run typecheck
npm run test:db
npm run build
npm run web
```

Kiểm thử browser: cài Chromium bằng `npx playwright install chromium`, khởi động web Demo Mode trên cổng 3001, rồi chạy `npm run test:web`. Máy cần có các thư viện hệ thống/font cho Chromium. Bộ `tests/web/backend.spec.ts` dùng REST giả lập và biến `TEST_BACKEND=1` trên preview đã cấu hình URL `http://127.0.0.1:54321` và một khóa công khai giả; bộ này không gửi dữ liệu lên Supabase thật.
