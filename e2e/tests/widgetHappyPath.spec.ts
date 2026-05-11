/**
 * widgetHappyPath.spec.ts — visitor opens the widget, sends a message, and the
 * message persists in the conversation log.
 *
 * The widget lives in two surfaces:
 *   1. The FAB launcher button + its open shadow root, mounted directly on the
 *      demo page by `widget.js`.
 *   2. The chat dialog itself, rendered inside a same-origin iframe at
 *      `/embed/:siteKey`. Playwright accesses iframe contents via
 *      `frameLocator(...)`.
 *
 * The assistant reply assertion only fires when the upstream LLM is reachable.
 * In CI without `LLM4AGENTS_API_KEY` configured, set `E2E_SKIP_LLM=1` to skip
 * that single assertion — the visitor-side round-trip still runs.
 */
import { test, expect } from '@playwright/test'
import { seedAdminAndOnboarding } from '../helpers/seedDb'

const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:3001'
const IFRAME_SELECTOR = 'iframe[title="Support chat"]'

test.describe.serial('widget happy path', () => {
  test.beforeAll(async () => {
    await seedAdminAndOnboarding()
  })

  test('visitor opens widget, sends a message, message appears in the log', async ({ page }) => {
    await page.goto(`${BACKEND}/widget-demo`)

    // Launcher button — bootstrap.ts sets aria-label "Open support chat" /
    // "Close support chat" depending on state. The shadow root is `mode: 'open'`
    // so Playwright's role queries can reach into it.
    const trigger = page.getByRole('button', { name: /open support chat/i })
    await expect(trigger).toBeVisible()
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')

    // The chat dialog lives inside the iframe.
    const chat = page.frameLocator(IFRAME_SELECTOR)
    const dialog = chat.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const input = chat.getByRole('textbox', { name: /mensaje|message/i })
    await expect(input).toBeVisible()
    await input.fill('Hola, ¿pueden ayudarme con un pedido?')

    const send = chat.getByRole('button', { name: /enviar|^send$/i })
    await send.click()

    // Visitor message must persist in the conversation log immediately
    // (it's rendered optimistically before the SSE round-trip).
    const log = chat.getByRole('log', { name: /mensajes|messages/i })
    await expect(log).toContainText('¿pueden ayudarme con un pedido?', { timeout: 5_000 })

    if (process.env['E2E_SKIP_LLM'] !== '1') {
      // Best-effort: the assistant's article surface eventually appears.
      // ChatPanel labels assistant bubbles via `aria-label={t('widget.agentMessage')}`
      // → "Mensaje del agente" (ES) / "Agent message" (EN). The streaming
      // bubble uses `widget.assistantStreaming` — match either.
      const assistantMsg = chat.getByRole('article', { name: /agente|agent|asistente/i })
      await expect(assistantMsg.first()).toBeVisible({ timeout: 30_000 })
    }
  })
})
