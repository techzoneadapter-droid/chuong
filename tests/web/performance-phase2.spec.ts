import { test, expect } from '@playwright/test';

test.skip(Boolean(process.env.TEST_BACKEND), 'Demo-only stress verification');

test('large library virtualizes rows and remains scrollable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('chuong:retired-demo-cleanup:2026-10-04', '1');
    localStorage.setItem('chuong:library', JSON.stringify(Array.from({ length: 500 }, (_, index) => ({
      bookId: `missing-${index}`, status: 'reading', addedAt: '2026-10-10T00:00:00Z',
    }))));
  });
  await page.goto('/library');
  const missing = page.getByText('Truyện không còn công khai.', { exact: true });
  await expect(missing.first()).toBeVisible();
  await expect.poll(() => missing.count()).toBeLessThan(60);
  const initial = await missing.count();
  await page.mouse.wheel(0, 10000);
  await expect.poll(() => missing.count()).toBeLessThan(100);
  expect(errors).toEqual([]);
  console.log(`Library fixture: 500 entries, ${initial} initial mounted missing rows`);
});

test('reader initializes voices on demand and diagnostics preserve navigation', async ({ page }) => {
  await page.addInitScript(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    let calls = 0;
    Object.defineProperty(window, '__voiceCalls', { get: () => calls });
    synth.getVoices = () => { calls++; return []; };
  });
  await page.goto('/reader/kiem-yen-van?chapter=1');
  await expect(page.getByText('Chương 1', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__voiceCalls)).toBe(0);
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as any).__CHUONG_PERF__))).toBe(true);
  await page.evaluate(() => (globalThis as any).__CHUONG_PERF__.start());
  await expect(page.getByText('Chương 1', { exact: true })).toBeVisible();
  await page.getByText('Nghe', { exact: true }).click();
  await expect(page.getByText('Tự động sang chương sau', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__voiceCalls)).toBeGreaterThan(0);
  const report = await page.evaluate(() => {
    const api = (globalThis as any).__CHUONG_PERF__;
    api.stop();
    return api.report();
  });
  expect(report.reactRender.samples).toBeGreaterThan(0);
  console.log(`Development web diagnostic sample: ${JSON.stringify(report)}`);
});
