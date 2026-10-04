import { test, expect } from '@playwright/test';

test.skip(Boolean(process.env.TEST_BACKEND), 'Demo-only suite');
const routes = [
  ['/', 'Mỗi chương, một thế giới.'], ['/discover', 'Khám phá'], ['/library', 'Tủ sách'], ['/profile', 'Đọc tự do'],
  ['/auth/login', 'Đăng nhập'], ['/auth/register', 'Đăng ký'], ['/auth/forgot', 'Quên mật khẩu'],
  ['/book/kiem-yen-van', 'Kiếm Yên Vân'], ['/book/kiem-yen-van/chapters', 'Danh sách chương'],
  ['/reader/kiem-yen-van?chapter=1', 'Chương 1'],
  ['/author/onboarding', 'Trở thành tác giả'], ['/author/books/new', 'Tạo truyện'],
  ['/author/books/demo/chapters/new', 'Trình soạn thảo chương'], ['/profile/edit', 'Chỉnh sửa hồ sơ'],
  ['/community', 'Cộng đồng'], ['/user/demo', 'Hồ sơ này không công khai'], ['/profile/privacy', 'Đăng nhập'],
  ['/settings', 'Cài đặt'], ['/settings/reading', 'Giao diện & đọc'], ['/premium', 'CHƯƠNG VIP'],
] as const;

test('all requested demo routes render without runtime errors or overflow', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  for (const [route, text] of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator('body')).toContainText(text);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('anonymous library and reader progress/bookmarks persist across reload', async ({ page }) => {
  await page.goto('/book/kiem-yen-van');
  await page.getByText('Theo dõi tác giả', { exact: true }).click();
  await page.reload();
  await expect(page.getByText('Đang theo dõi', { exact: true })).toBeVisible();
  await page.getByText('Tủ sách', { exact: true }).click();
  await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible();
  await page.goto('/library');
  await expect(page.getByText('Kiếm Yên Vân', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Kiếm Yên Vân', { exact: true })).toBeVisible();
  await page.getByText('Đọc tiếp', { exact: true }).click();
  await expect(page).toHaveURL(/reader/);
  await page.getByText('Thêm', { exact: true }).click();
  await page.getByText('Lưu vị trí đọc', { exact: false }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('chuong:bookmarks'))).toContain('kiem-yen-van');
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('chuong:bookmarks'))).toContain('kiem-yen-van');
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('chuong:reading-progress')), { timeout: 7000 }).toContain('kiem-yen-van');
  await page.goto('/book/kiem-yen-van');
  await expect(page.getByText(/Đọc tiếp · Chương/)).toBeVisible();
});

test('reader settings and real Vietnamese TTS controls remain interactive', async ({ page }) => {
  await page.goto('/settings/reading');
  await page.getByText('Lật trang', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reader:settings'))).toContain('"mode":"page"');
  await page.goto('/reader/kiem-yen-van?chapter=1');
  await expect(page.getByText(/Lật trang · 1\//)).toBeVisible();
  await page.getByText('Trang sau', { exact: true }).click();
  await expect(page.getByText(/Lật trang · 2\//)).toBeVisible();
  await page.getByText('Giao diện', { exact: true }).click();
  await page.getByText('Cuộn dọc', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reader:settings'))).toContain('"mode":"scroll"');
  await page.goto('/reader/kiem-yen-van?chapter=1');
  await page.getByText('Giao diện', { exact: true }).click();
  await expect(page.getByText('Cỡ chữ', { exact: true })).toBeVisible();
  await page.getByText('Đêm', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reader:settings'))).toContain('night');
  await page.goto('/reader/kiem-yen-van?chapter=1');
  await page.getByText('Nghe', { exact: true }).click();
  await expect(page.locator('body')).toContainText('TTS hệ thống');
  await expect(page.locator('body')).not.toContainText('Google UK English');
  await expect(page.getByText('Tự động sang chương sau', { exact: true })).toBeVisible();
  await page.getByText('1.25x', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reader:tts'))).toContain('"speed":1.25');
});
