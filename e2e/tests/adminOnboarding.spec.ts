/**
 * adminOnboarding.spec.ts — drive the first-run wizard end-to-end.
 *
 * The wizard only runs against a virgin database (no admins, no site
 * config). Once `seedAdminAndOnboarding` has run anywhere in the suite,
 * onboarding is already complete and this spec is meaningless. So this
 * file does NOT call seedDb in beforeAll — instead, it hits
 * `/v1/admin/auth/status` and skips itself when an admin already exists.
 *
 * To exercise this spec against an already-populated DB, recycle Postgres:
 *   cd docker && docker compose down -v && docker compose up postgres -d
 * Or set `E2E_SKIP_ONBOARDING=1` explicitly.
 */
import { test, expect, request as pwRequest } from '@playwright/test'

const ADMIN = process.env['ADMIN_URL'] ?? 'http://localhost:5173'
const BACKEND = process.env['BACKEND_URL'] ?? 'http://localhost:3001'

type AuthStatus = Readonly<{ adminExists: boolean }>

async function adminExists(): Promise<boolean> {
  const ctx = await pwRequest.newContext({ baseURL: BACKEND })
  try {
    const res = await ctx.get('/v1/admin/auth/status')
    if (!res.ok()) return false
    const body = (await res.json()) as AuthStatus
    return body.adminExists
  } finally {
    await ctx.dispose()
  }
}

const onboardingFixture = {
  email: 'wizard-admin@e2e.test',
  password: 'wizard-test-pw-1234',
  siteName: 'E2E Wizard Co.',
  primaryColor: '#4f46e5',
  apiKey: 'sk-proxy-wizard-test-00000000',
  agentModel: 'openai/gpt-4o-mini',
  systemPrompt:
    'Sos un agente de soporte amable, conciso y profesional. Respondé en castellano y escalá a un humano cuando sea apropiado.',
} as const

test.describe.serial('admin onboarding wizard', () => {
  test('runs the full wizard end-to-end and lands on the dashboard', async ({ page }) => {
    test.skip(
      process.env['E2E_SKIP_ONBOARDING'] === '1',
      'E2E_SKIP_ONBOARDING=1 — wizard already completed in this DB',
    )

    if (await adminExists()) {
      test.skip(true, 'an admin already exists — wizard would be inaccessible')
    }

    // 1. Land on /onboarding — the route renders the wizard regardless of
    //    admin status, so we navigate directly rather than depending on the
    //    BootRedirect heuristic.
    await page.goto(`${ADMIN}/onboarding`)

    // ── Step 0: Welcome ──────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /bienvenido a llm4agents/i })).toBeVisible()
    await page.getByRole('button', { name: /empezar/i }).click()

    // ── Step 1: Create admin account ─────────────────────────────────────
    await expect(page.getByRole('heading', { name: /crear cuenta admin/i })).toBeVisible()
    await page.getByLabel(/^email$/i).fill(onboardingFixture.email)
    await page.getByLabel(/contraseña/i).fill(onboardingFixture.password)
    await page.getByRole('button', { name: /crear cuenta/i }).click()

    // ── Step 2: Site config ──────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /configuraci[oó]n del sitio/i })).toBeVisible()
    await page.getByLabel(/nombre del sitio/i).fill(onboardingFixture.siteName)
    // SiteConfigStep has two inputs sharing the "Color principal" label —
    // a <input type="color"> and a hex text input. The first match is the
    // color picker; setting its value via .fill works in Chromium.
    await page.getByLabel(/color principal/i).first().fill(onboardingFixture.primaryColor)
    await page.getByRole('button', { name: /continuar/i }).click()

    // ── Step 3: Connect agent ────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /conectar tu agente/i })).toBeVisible()
    await page.getByLabel(/clave de api/i).fill(onboardingFixture.apiKey)
    await page.getByLabel(/^modelo$/i).fill(onboardingFixture.agentModel)
    await page.getByRole('button', { name: /continuar/i }).click()

    // ── Step 4: System prompt ────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /prompt del sistema/i })).toBeVisible()
    // The textarea has a label "Prompt del sistema"; the heading uses the
    // same string, so target the textbox role explicitly.
    const promptBox = page.getByRole('textbox', { name: /prompt del sistema/i })
    await promptBox.fill(onboardingFixture.systemPrompt)
    await page.getByRole('button', { name: /guardar y continuar/i }).click()

    // ── Step 5: Embed snippet ────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /integrar el widget/i })).toBeVisible()
    // The snippet card renders a <pre> with the script tag — assert it's there.
    await expect(page.getByText(/data-site-key=|widget\.js/i)).toBeVisible()
    await page.getByRole('button', { name: /ir al dashboard/i }).click()

    // Final assertion: lands on /conversations (the post-onboarding default).
    await page.waitForURL(/\/conversations/i, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /^conversaciones$/i })).toBeVisible()
  })
})
