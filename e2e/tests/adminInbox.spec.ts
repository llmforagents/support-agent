/**
 * adminInbox.spec.ts — operator claim → message → release flow.
 *
 * Getting a session into the `handoff_requested` state from outside the
 * backend is not possible cleanly — the transition only happens via the
 * AI's `handoff` tool call. So this spec drives a visitor message that's
 * very likely to escalate and then polls the admin sessions API for the
 * handoff state. If the model doesn't cooperate within the timeout, we
 * skip the rest of the operator flow rather than fail.
 *
 * Set `E2E_SKIP_LLM=1` to skip the entire spec — useful when running
 * against a stack without `LLM4AGENTS_API_KEY` configured.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { seedAdminAndOnboarding, DEFAULT_FIXTURE } from '../helpers/seedDb'

const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:3001'
const ADMIN = process.env['ADMIN_URL'] ?? 'http://localhost:5173'
const IFRAME_SELECTOR = 'iframe[title="Support chat"]'

type SessionSummary = Readonly<{
  id: string
  state: { readonly status: string }
}>
type SessionListResponse = Readonly<{ sessions: readonly SessionSummary[] }>

async function loginAdminUi(page: Page): Promise<void> {
  await page.goto(`${ADMIN}/login`)
  await page.getByLabel(/email/i).fill(DEFAULT_FIXTURE.admin.email)
  await page.getByLabel(/contraseña|password/i).fill(DEFAULT_FIXTURE.admin.password)
  await page.getByRole('button', { name: /iniciar sesi[oó]n|sign in|log in/i }).click()
  await page.waitForURL(/\/conversations|\/dashboard|\/sessions/i, { timeout: 10_000 })
}

async function ensureAdminOnline(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: /operador.*(desconectado|en l[ií]nea)/i })
  await expect(toggle).toBeVisible()
  const pressed = await toggle.getAttribute('aria-pressed')
  if (pressed !== 'true') {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 })
  }
}

async function findHandoffSessionId(ctx: APIRequestContext, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await ctx.get('/v1/admin/sessions?status=handoff_requested&limit=10')
    if (res.ok()) {
      const body = (await res.json()) as SessionListResponse
      const first = body.sessions[0]
      if (first !== undefined) return first.id
    }
    await new Promise((resolve) => { setTimeout(resolve, 1_500) })
  }
  return null
}

test.describe.serial('admin inbox', () => {
  test.beforeAll(async () => {
    await seedAdminAndOnboarding()
  })

  test('claim + send operator message + release flow', async ({ page, browser }) => {
    test.skip(
      process.env['E2E_SKIP_LLM'] === '1',
      'E2E_SKIP_LLM=1 — the AI must escalate to produce a handoff_requested session',
    )

    // 1. Admin signs in via the UI and toggles online.
    await loginAdminUi(page)
    await ensureAdminOnline(page)

    // 2. In a separate visitor context, send a strong escalation message.
    //    The model has to fire its handoff tool to transition state.
    const visitorCtx = await browser.newContext()
    const visitorPage = await visitorCtx.newPage()
    await visitorPage.goto(`${BACKEND}/widget-demo`)
    await visitorPage.getByRole('button', { name: /open support chat/i }).click()
    const chat = visitorPage.frameLocator(IFRAME_SELECTOR)
    await chat.getByRole('textbox', { name: /mensaje|message/i }).fill(
      'Tengo un problema urgente con un cobro. Necesito hablar con una persona, no con un bot.',
    )
    await chat.getByRole('button', { name: /enviar|^send$/i }).click()

    // 3. Poll the admin sessions API for a handoff_requested row.
    //    Reuse the seeded admin's APIRequestContext.
    const { ctx } = await seedAdminAndOnboarding()
    const handoffId = await findHandoffSessionId(ctx, 45_000)
    await visitorCtx.close()

    test.skip(
      handoffId === null,
      'no handoff_requested session appeared within 45s — the model did not escalate',
    )
    // After the skip we know it's non-null.
    const sessionId: string = handoffId ?? ''

    // 4. In the admin UI, select the handoff_requested filter, click the row.
    await page.goto(`${ADMIN}/conversations`)
    await page.getByRole('button', { name: /^handoff$/i }).click()

    const row = page.getByRole('button', { name: new RegExp(`visitor ${sessionId.slice(0, 8)}`, 'i') })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.click()

    // 5. Claim.
    await page.getByRole('button', { name: /^reclamar$/i }).click()
    await expect(page.getByRole('button', { name: /^liberar$/i })).toBeVisible({ timeout: 10_000 })

    // 6. Send an operator message. OperatorComposer has a textarea labelled
    //    "Mensaje del operador" and a submit button "Enviar".
    const composer = page.getByRole('textbox', { name: /mensaje del operador/i })
    await composer.fill('Hola, soy María del equipo de soporte. ¿En qué te puedo ayudar?')
    await page.getByRole('button', { name: /^enviar$/i }).click()

    // The message log on the admin side should reflect the operator turn.
    const log = page.getByRole('log', { name: /mensajes de la conversaci[oó]n/i })
    await expect(log).toContainText('soy María', { timeout: 10_000 })

    // 7. Release.
    await page.getByRole('button', { name: /^liberar$/i }).click()
    // Once released, the "Reclamar" button is no longer visible because the
    // session is back in `released_to_ai`. The composer also disables.
    await expect(page.getByRole('button', { name: /^liberar$/i })).toBeHidden({ timeout: 10_000 })
  })
})
