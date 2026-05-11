import { defineConfig, devices } from '@playwright/test'

// Playwright config for the live-stack E2E suite. Tests run sequentially
// (`workers: 1`) because they share a single backend instance and Postgres
// schema — parallel runs would race on admin bootstrap and onboarding state.
//
// The dev servers are NOT spun up by Playwright in D1 — D2 wires the
// `webServer` block once the `dev:test` orchestration script lands.

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
