import { test, expect, Page } from '@playwright/test';

test.skip(!process.env.TEST_BACKEND, 'Requires configured mock backend build');
const userId = '10000000-0000-4000-8000-000000000001';
const authorId = '20000000-0000-4000-8000-000000000001';
const bookId = '30000000-0000-4000-8000-000000000001';
const chapterId = '40000000-0000-4000-8000-000000000001';
const now = new Date().toISOString();
const book = { id: bookId, author_id: authorId, title: 'Truyện từ máy chủ', slug: 'server-book', description: 'Nội dung thật từ kho dữ liệu backend.', cover_url: null, language: 'vi', source_type: 'original', status: 'ongoing', visibility: 'public', is_vip: false, price_coins: 0, rating: 0, views_count: 0, followers_count: 0, total_chapters: 2, tags: [], created_at: now, updated_at: now };
const author = { id: authorId, user_id: userId, pen_name: 'Tác giả kiểm thử', bio: '', avatar_url: null, followers_count: 0, verified: false, created_at: now };
const profile = { id: userId, display_name: 'Độc giả kiểm thử', username: 'reader_test', bio: 'Hồ sơ thật', avatar_url: null, role: 'author', created_at: now, updated_at: now };
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'reader@example.test', user_metadata: { display_name: 'Độc giả kiểm thử' }, app_metadata: {}, created_at: now };
const session = { access_token: 'test.access.token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const chapters = [1, 4].map((number) => ({ id: number === 1 ? chapterId : '40000000-0000-4000-8000-000000000004', book_id: bookId, chapter_number: number, title: `Nội dung máy chủ ${number}`, content: `Văn bản từ backend chương ${number}. `.repeat(80), status: 'published', is_vip: false, price_coins: 0, published_at: now, created_at: now, updated_at: now }));

async function mock(page: Page, authenticated = false) {
  const writes: { table: string; method: string; data: Record<string, unknown> }[] = [];
  if (authenticated) await page.addInitScript((value) => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), session);
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname.includes('/auth/v1/')) {
      if (url.pathname.endsWith('/token')) return route.fulfill({ json: session });
      if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
      if (url.pathname.endsWith('/signup')) return route.fulfill({ json: { user, session: null } });
      return route.fulfill({ json: {} });
    }
    const table = url.pathname.split('/').at(-1)!;
    if (request.method() !== 'GET') {
      const data = request.postDataJSON() ?? {}; writes.push({ table, method: request.method(), data });
      if (table === 'chapters') {
        if (data.status === 'published') return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } });
        await new Promise((resolve) => setTimeout(resolve, 700));
        return route.fulfill({ json: { id: chapterId } });
      }
      return route.fulfill({ json: table === 'profiles' ? profile : {} });
    }
    let data: Record<string, unknown>[] = table === 'books' ? [book] : table === 'authors' ? [author] : table === 'profiles' ? [profile] : table === 'book_genres' ? [{ book_id: bookId, genre: 'Fantasy' }] : table === 'chapters' ? chapters : [];
    const number = url.searchParams.get('chapter_number');
    if (number) data = data.filter((row) => row.chapter_number === Number(number.replace('eq.', '')));
    if (table === 'chapters' && !url.searchParams.get('select')?.split(',').includes('content') && url.searchParams.get('select') !== '*') data = data.map(({ content: _content, ...row }) => row);
    const single = request.headers().accept?.includes('vnd.pgrst.object');
    await route.fulfill({ json: single ? data[0] ?? null : data });
  });
  return writes;
}

test('backend reader displays backend content, navigates sparse chapter numbers, and never substitutes demo on missing books', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await mock(page);
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Nội dung máy chủ 1', { exact: true })).toBeVisible();
  await expect(page.locator('body')).toContainText('Văn bản từ backend chương 1.');
  await page.getByText('Chương sau', { exact: true }).click();
  await expect(page.getByText('Nội dung máy chủ 4', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/chapter=4/);
  await page.route('**/rest/v1/books?**', (route) => route.fulfill({ json: null }));
  await page.goto(`/reader/${bookId}`);
  await expect(page.getByText('Không tìm thấy truyện công khai.', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Kiếm Yên Vân');
  expect(errors).toEqual([]);
});

test('session restores profile, progress flushes on reader exit, and logout clears account', async ({ page }) => {
  const writes = await mock(page, true);
  await page.goto('/profile');
  await expect(page.getByText('Độc giả kiểm thử', { exact: true })).toBeVisible();
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Nội dung máy chủ 1', { exact: true })).toBeVisible();
  await page.mouse.wheel(0, 900);
  // SPA navigation causes the Reader focus cleanup to flush; avoid a browser reload here.
  await page.getByText('AI', { exact: true }).click();
  await page.getByText('Convert chuẩn', { exact: false }).click();
  await expect.poll(() => writes.filter((item) => item.table === 'reading_progress').length).toBeGreaterThan(0);
  expect(writes.find((item) => item.table === 'reading_progress')?.data.user_id).toBe(userId);
  await page.goto('/profile');
  await page.getByText('Đăng xuất', { exact: true }).click();
  await expect(page.getByText('Đăng nhập', { exact: true })).toBeVisible();
});

test('chapter autosave serializes insertion and failed publish retains draft state', async ({ page }) => {
  const writes = await mock(page, true);
  await page.goto(`/author/books/${bookId}/chapters/new`);
  await page.getByPlaceholder('Tên chương').fill('Bản thảo mới');
  await page.getByPlaceholder('Bắt đầu câu chuyện…').fill('Nội dung bản thảo mới có ít nhất năm mươi ký tự để thử xuất bản chương.');
  await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible({ timeout: 6000 });
  expect(writes.filter((item) => item.table === 'chapters' && item.method === 'POST')).toHaveLength(1);
  await page.getByText('Xuất bản', { exact: true }).click();
  await expect(page.locator('body')).toContainText('Bạn không có quyền thực hiện thao tác này.');
  await expect(page.getByText('Xuất bản', { exact: true })).toBeVisible();
  await expect(page.getByText('Gỡ xuất bản', { exact: true })).toHaveCount(0);
});

test('login submits email/password and displays account', async ({ page }) => {
  await mock(page);
  await page.goto('/auth/login');
  await page.getByPlaceholder('ban@example.com').fill('reader@example.test');
  await page.getByPlaceholder('Ít nhất 6 ký tự').fill('testing123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Độc giả kiểm thử', { exact: true })).toBeVisible();
});
