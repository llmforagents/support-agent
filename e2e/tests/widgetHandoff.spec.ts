/**
 * widgetHandoff.spec.ts — visitor explicitly requests a human; the conversation
 * transitions to `handoff_requested` and shows up in the admin inbox.
 *
 * Important caveat: there is no clean external endpoint to force the
 * handoff state — it can only be triggered by the AI's `handoff` tool. So
 * this spec relies on the LLM actually escalating in response to a strongly-
 * worded visitor message. That's brittle by definition: if the model doesn't
 * cooperate, the assertion times out. Set `E2E_SKIP_LLM=1` to skip the
 * AI-dependent assertion while still exercising the surrounding flow
 * (admin login, online toggle, visitor session creation).
 */
import { test, expect, type Browser, type Page } from '@playwright/test'
import { seedAdminAndOnboarding, DEFAULT_FIXTURE } from '../helpers/seedDb'

const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:3001'
const ADMIN = process.env['ADMIN_URL'] ?? 'http://localhost:5173'
const IFRAME_SELECTOR = 'iframe[title="Support chat"]'

type LoginResult = Readonly<{ page: Page }>

async function loginAdmin(browser: Browser): Promise<LoginResult> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${ADMIN}/login`)
  await page.getByLabel(/email/i).fill(DEFAULT_FIXTURE.admin.email)
  await page.getByLabel(/contraseña|password/i).fill(DEFAULT_FIXTURE.admin.password)
  await page.getByRole('button', { name: /iniciar sesi[oó]n|sign in|log in/i }).click()
  await page.waitForURL(/\/conversations|\/dashboard|\/sessions/i, { timeout: 10_000 })
  return { page }
}

test.describe.serial('widget handoff', () => {
  test.beforeAll(async () => {
    await seedAdminAndOnboarding()
  })

  test('visitor requests human, conversation transitions, admin sees handoff', async ({ browser }) => {
    // 1. Admin signs in and toggles online so handoff is allowed.
    const { page: adminPage } = await loginAdmin(browser)

    // OnlineToggle is a button with aria-pressed, not a switch. Its aria-label
    // toggles between "Operador desconectado…" (off) and "Operador en línea…" (on).
    const onlineToggle = adminPage.getByRole('button', { name: /operador.*(desconectado|en l[ií]nea)/i })
    await expect(onlineToggle).toBeVisible()
    const pressedAttr = await onlineToggle.getAttribute('aria-pressed')
    if (pressedAttr !== 'true') {
      await onlineToggle.click()
      await expect(onlineToggle).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 })
    }

    // 2. Visitor opens the widget in a fresh context and explicitly asks
    //    for a human. We can't directly force the handoff state from outside
    //    the backend — it has to come from the AI's tool call.
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    await visitorPage.goto(`${BACKEND}/widget-demo`)

    const trigger = visitorPage.getByRole('button', { name: /open support chat/i })
    await trigger.click()

    const chat = visitorPage.frameLocator(IFRAME_SELECTOR)
    const input = chat.getByRole('textbox', { name: /mensaje|message/i })
    await expect(input).toBeVisible()
    await input.fill('Necesito hablar urgentemente con una persona, no con un bot.')
    await chat.getByRole('button', { name: /enviar|^send$/i }).click()

    // 3. Admin inbox eventually surfaces the handoff. This is the brittle
    //    bit — it assumes the model responds with a handoff tool call.
    if (process.env['E2E_SKIP_LLM'] !== '1') {
      // Click the "Handoff" filter button so we only see escalated sessions.
      // SessionList renders filter chips as <button aria-pressed=…>.
      const handoffFilter = adminPage.getByRole('button', { name: /^handoff$/i })
      await handoffFilter.click()

      // expect.poll converges on the right state without hard waits.
      await expect
        .poll(
          async () => {
            // The session list shows a "Handoff" status badge per row.
            const badge = adminPage.getByText(/^handoff$/i).first()
            return await badge.isVisible().catch(() => false)
          },
          { timeout: 45_000, intervals: [1_000, 2_000, 3_000] },
        )
        .toBe(true)
    }

    await visitorCtx.close()
    await adminPage.context().close()
  })
})
