import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/web',
  timeout: 30000,
  workers: 1,
  use: { baseURL: process.env.TEST_BASE_URL || 'http://localhost:3001', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
});
