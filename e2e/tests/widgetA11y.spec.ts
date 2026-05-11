/**
 * widgetA11y.spec.ts — WCAG 2.1 AA axe scans of every widget state.
 *
 * Shadow DOM: the FAB renders inside an `attachShadow({ mode: 'open' })`
 * tree (see apps/widget/src/bootstrap.ts). `@axe-core/playwright` >= 4.10
 * traverses open shadow roots automatically. The dialog itself lives in a
 * same-origin iframe at /embed/:siteKey, which axe also scans automatically.
 *
 * If any violation is reported, fix it back in the widget source — do NOT
 * loosen this assertion. Third-party violations should be `.disableRules([…])`
 * with an explanatory comment.
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { seedAdminAndOnboarding } from '../helpers/seedDb'

const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:3001'
const IFRAME_SELECTOR = 'iframe[title="Support chat"]'

test.describe.serial('widget WCAG AA', () => {
  test.beforeAll(async () => {
    await seedAdminAndOnboarding()
  })

  test('closed state (trigger button only) passes WCAG AA', async ({ page }) => {
    await page.goto(`${BACKEND}/widget-demo`)
    // Wait for the bootstrap to mount the FAB before scanning.
    await expect(page.getByRole('button', { name: /open support chat/i })).toBeVisible()

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(JSON.stringify(results.violations, null, 2)).toBe('[]')
  })

  test('open state (panel + empty message list) passes WCAG AA', async ({ page }) => {
    await page.goto(`${BACKEND}/widget-demo`)
    await page.getByRole('button', { name: /open support chat/i }).click()
    await expect(page.frameLocator(IFRAME_SELECTOR).getByRole('dialog')).toBeVisible()

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(JSON.stringify(results.violations, null, 2)).toBe('[]')
  })

  test('after a visitor message round-trip passes WCAG AA', async ({ page }) => {
    await page.goto(`${BACKEND}/widget-demo`)
    await page.getByRole('button', { name: /open support chat/i }).click()

    const chat = page.frameLocator(IFRAME_SELECTOR)
    const input = chat.getByRole('textbox', { name: /mensaje|message/i })
    await expect(input).toBeVisible()
    await input.fill('Hola, una consulta rápida.')
    await chat.getByRole('button', { name: /enviar|^send$/i }).click()
    await expect(chat.getByRole('log')).toContainText('consulta rápida', { timeout: 10_000 })

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(JSON.stringify(results.violations, null, 2)).toBe('[]')
  })
})
