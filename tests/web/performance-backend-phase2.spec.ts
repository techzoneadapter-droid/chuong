import { test, expect } from '@playwright/test';

test.skip(!process.env.TEST_BACKEND, 'Requires the localhost mock backend server');

test('discovery pages 105 books without mounting the whole result set', async ({ page }) => {
  const offsets: number[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const ids = Array.from({ length: 105 }, (_, index) => `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  const books = ids.map((id, index) => ({
    id, author_id: '20000000-0000-4000-8000-000000000001', title: `Fixture ${String(index).padStart(3, '0')}`,
    slug: `fixture-${index}`, description: 'Test', cover_url: null, credited_author_name: 'Fixture author',
    status: 'ongoing', visibility: 'public', language: 'vi', source_type: 'original', tags: [],
    total_chapters: 1, rating: 4, rating_count: 1, followers_count: 0, views_count: 1, is_vip: false, price_coins: 0,
  }));
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/search_public_book_ids')) {
      const args = route.request().postDataJSON();
      offsets.push(args.p_offset);
      return route.fulfill({ json: ids.slice(args.p_offset, args.p_offset + args.p_limit)
        .map((id) => ({ book_id: id, total_count: 105 })) });
    }
    if (url.pathname.endsWith('/books')) {
      const requested = url.searchParams.get('id') ?? '';
      return route.fulfill({ json: books.filter((book) => requested.includes(book.id)) });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/discover');
  await page.getByRole("textbox").fill("fixture");
  await expect(page.getByText('Fixture 000', { exact: true })).toBeVisible();
  expect(await page.getByText(/^Fixture \d{3}$/).count()).toBeLessThan(30);
  await page.getByText('Fixture 000', { exact: true }).evaluate((node) => {
    let parent = node.parentElement;
    while (parent) {
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) {
        parent.setAttribute('data-test-discovery-scroll', 'true');
        return;
      }
      parent = parent.parentElement;
    }
    throw new Error('Discovery scroll container not found');
  });
  const scrollResults = () => page.locator('[data-test-discovery-scroll]').evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect.poll(async () => {
    await scrollResults();
    return offsets.includes(80);
  }, { timeout: 15000 }).toBe(true);
  await expect.poll(async () => {
    await scrollResults();
    return page.getByText('Fixture 104', { exact: true }).isVisible();
  }, { timeout: 15000 }).toBe(true);
  expect(await page.getByText(/^Fixture \d{3}$/).count()).toBeLessThan(50);
  expect(offsets).toEqual([0, 40, 80]);
  expect(errors).toEqual([]);
});
