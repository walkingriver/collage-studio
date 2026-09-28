// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174/',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    // Edge is the main target (Windows). Falls back to Chrome in CI if Edge isn't installed.
    { name: 'edge', use: { channel: process.env.PW_CHANNEL || 'msedge' } },
  ],
  webServer: {
    command: 'node scripts/serve.mjs 5174',
    url: 'http://localhost:5174/',
    reuseExistingServer: true,
  },
});
