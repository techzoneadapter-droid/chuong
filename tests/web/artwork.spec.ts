import { test, expect } from '@playwright/test';

test.skip(Boolean(process.env.TEST_BACKEND), 'Demo-only artwork verification');

test('artwork loads across reader screens on mobile and desktop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [name, route, text] of [
      ['home', '/', 'Mỗi chương, một thế giới.'],
      ['detail', '/book/kiem-yen-van', 'Kiếm Yên Vân'],
      ['library', '/library', 'Tủ sách'],
      ['reader', '/reader/kiem-yen-van?chapter=1', 'Chương 1'],
    ]) {
      await page.goto(route);
      await expect(page.locator('body')).toContainText(text);
      if (name === 'home') await expect(page.getByRole('img', { name: 'Logo CHƯƠNG' })).toBeVisible();
      await expect.poll(() => page.locator('img').evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `test-results/${name}-${width}.png` });
    }
  }
  expect(errors).toEqual([]);
});
