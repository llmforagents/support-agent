/**
 * adminA11y.spec.ts — WCAG 2.1 AA axe scans of every admin surface.
 *
 * Each spec logs in fresh (the auth cookie lives on the Playwright context,
 * not the page) and runs an axe analysis against the resulting route. If a
 * violation is reported, fix it in the admin source rather than loosening
 * the assertion — `.disableRules` is reserved for third-party issues we
 * have no control over.
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { seedAdminAndOnboarding, DEFAULT_FIXTURE } from '../helpers/seedDb'

const ADMIN = process.env['ADMIN_URL'] ?? 'http://localhost:5173'

async function loginAdmin(page: Page): Promise<void> {
  await page.goto(`${ADMIN}/login`)
  await page.getByLabel(/email/i).fill(DEFAULT_FIXTURE.admin.email)
  await page.getByLabel(/contraseña|password/i).fill(DEFAULT_FIXTURE.admin.password)
  await page.getByRole('button', { name: /iniciar sesi[oó]n|sign in|log in/i }).click()
  await page.waitForURL(/\/conversations|\/dashboard|\/sessions/i, { timeout: 10_000 })
}

test.describe.serial('admin WCAG AA', () => {
  test.beforeAll(async () => {
    await seedAdminAndOnboarding()
  })

  test('login page', async ({ page }) => {
    await page.goto(`${ADMIN}/login`)
    await expect(page.getByRole('heading', { name: /admin login/i })).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(JSON.stringify(results.violations, null, 2)).toBe('[]')
  })

  test('conversations (inbox)', async ({ page }) => {
    await loginAdmin(page)
    await page.goto(`${ADMIN}/conversations`)
    await expect(page.getByRole('heading', { name: /^conversaciones$/i })).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(JSON.stringify(results.violations, null, 2)).toBe('[]')
  })

  test('settings (MCP toggle)', async ({ page }) => {
    await loginAdmin(page)
    await page.goto(`${ADMIN}/settings`)
    await expect(page.getByRole('heading', { name: /^configuraci[oó]n$/i })).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(JSON.stringify(results.violations, null, 2)).toBe('[]')
  })

  test('knowledge base', async ({ page }) => {
    await loginAdmin(page)
    await page.goto(`${ADMIN}/knowledge-base`)
    await expect(page.getByRole('heading', { name: /knowledge base/i })).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(JSON.stringify(results.violations, null, 2)).toBe('[]')
  })
})
