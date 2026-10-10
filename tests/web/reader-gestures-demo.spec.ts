import { test, expect } from '@playwright/test';

test.skip(Boolean(process.env.TEST_BACKEND), 'Demo settings integration');
test('global reading settings share safe gesture defaults and persist into Reader', async ({ page }) => {
  await page.goto('/settings/reading');
  await expect(page.getByText('Giao di\u1ec7n & \u0111\u1ecdc', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Vu\u1ed1t ngang chuy\u1ec3n ch\u01b0\u01a1ng', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('K\u00e9o v\u01b0\u1ee3t \u0111\u1ea7u/cu\u1ed1i chuy\u1ec3n ch\u01b0\u01a1ng', { exact: true })).not.toBeChecked();
  await page.getByLabel('Vu\u1ed1t ngang chuy\u1ec3n ch\u01b0\u01a1ng', { exact: true }).check();
  await page.getByLabel('K\u00e9o v\u01b0\u1ee3t \u0111\u1ea7u/cu\u1ed1i chuy\u1ec3n ch\u01b0\u01a1ng', { exact: true }).check();
  await page.getByText('Cao', { exact: true }).click();
  await page.getByText('Cu\u1ed1i ch\u01b0\u01a1ng', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reader:settings'))).toContain('"gestureSensitivity":"high"');
  await page.goto('/reader/kiem-yen-van?chapter=1');
  await expect(page.getByText('Ch\u01b0\u01a1ng 1', { exact: true })).toBeVisible();
  await page.getByText('Giao di\u1ec7n', { exact: true }).click();
  await expect(page.getByLabel('Vu\u1ed1t ngang chuy\u1ec3n ch\u01b0\u01a1ng', { exact: true })).toBeChecked();
  await expect(page.getByLabel('K\u00e9o v\u01b0\u1ee3t \u0111\u1ea7u/cu\u1ed1i chuy\u1ec3n ch\u01b0\u01a1ng', { exact: true })).toBeChecked();
  await page.goto('/settings/reading');
  await page.getByLabel('Kh\u00f4i ph\u1ee5c m\u1eb7c \u0111\u1ecbnh', { exact: true }).click();
  await expect(page.getByLabel('Vu\u1ed1t ngang chuy\u1ec3n ch\u01b0\u01a1ng', { exact: true })).not.toBeChecked();
});
