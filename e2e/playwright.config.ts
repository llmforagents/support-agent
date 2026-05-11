import { defineConfig, devices } from '@playwright/test'

// Playwright config for the live-stack E2E suite. Tests run sequentially
// (`workers: 1`) because they share a single backend instance and Postgres
// schema — parallel runs would race on admin bootstrap and onboarding state.
//
// The `webServer` block runs the workspace's `dev:test` script (backend +
// admin + widget concurrently). The healthcheck targets the backend's
// /readyz on :3001 — admin's :5173 serves the SPA index for any path and
// would falsely report healthy before the API is up.

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
  webServer: {
    command: 'pnpm --dir .. run dev:test',
    url: 'http://localhost:3001/readyz',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
