import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the full OCM stack (NestJS serving API + SPA) — usually the Docker
 * compose service on :8080. `e2e/run.sh` brings up a fresh (no-admin) stack
 * before running these. The single spec also captures README screenshots.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    colorScheme: 'dark',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
