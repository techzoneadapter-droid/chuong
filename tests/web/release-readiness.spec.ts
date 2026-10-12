import { test, expect } from '@playwright/test';

test('account deletion is discoverable and explains pending processing before login', async ({ page }) => {
  await page.goto('/settings');
  await page.getByText('Xóa tài khoản', { exact: true }).click();
  await expect(page.getByText('Xóa tài khoản CHƯƠNG', { exact: true })).toBeVisible();
  await expect(page.getByText(/Dữ liệu chưa bị xóa ngay/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập để yêu cầu xóa' })).toBeVisible();
});

test('library renders before slow chapter metadata and survives its failure', async ({ page }) => {
  test.skip(!process.env.TEST_BACKEND, 'Isolated mock backend only');
  const bookId = '30000000-0000-4000-8000-000000000077';
  await page.addInitScript(id => {
    localStorage.setItem('chuong:retired-demo-cleanup:2026-10-04', '1');
    localStorage.setItem('chuong:library', JSON.stringify([{ bookId: id, status: 'reading', addedAt: '2026-10-12' }]));
    localStorage.setItem('chuong:reading-progress', JSON.stringify({ [id]: { bookId: id, chapterNumber: 7, progressPercent: 50, scrollPosition: 0, updatedAt: '2026-10-12' } }));
  }, bookId);
  let finishMetadata: (() => void) | undefined;
  const waiting = new Promise<void>(resolve => { finishMetadata = resolve; });
  let requested = false;
  await page.route('http://127.0.0.1:54321/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/books')) return route.fulfill({ json: [{ id: bookId, author_id: 'author', title: 'Release shelf fixture',
      slug: 'release-shelf', description: '', status: 'ongoing', visibility: 'public', total_chapters: 50,
      rating: 0, views_count: 0, followers_count: 0, is_vip: false, price_coins: 0, tags: [] }] });
    if (path.endsWith('/chapters')) {
      requested = true;
      await waiting;
      return route.fulfill({ status: 503, json: { message: 'Metadata unavailable' } });
    }
    return route.fulfill({ json: [] });
  });
  try {
    await page.goto('/library');
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByText('Release shelf fixture', { exact: true })).toBeVisible();
    await expect(page.getByText('Chương 7 · 50% chương', { exact: true })).toBeVisible();
    finishMetadata!();
    await expect(page.getByText('Release shelf fixture', { exact: true })).toBeVisible();
    await expect(page.getByText('Không tải được tủ sách', { exact: true })).toHaveCount(0);
  } finally { finishMetadata!(); }
});
