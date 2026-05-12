/**
 * bootstrap.ts — vanilla DOM bootstrap script (IIFE build).
 *
 * Injected by the site owner via one of two equivalent snippet styles:
 *
 *   1) Recommended one-liner (what the onboarding wizard hands out):
 *      <script src="https://.../widget.js" data-site-key="abc123..." async></script>
 *
 *   2) Globals (legacy / iframe demo template):
 *      <script>window.__SITE_KEY__ = 'abc123...'</script>
 *      <script src="https://.../widget.js"></script>
 *
 * Either path produces the same launcher button + iframe-mounted Preact app.
 */

// Make this file a module so the global augmentation is valid
export {}

declare global {
  interface Window {
    __SITE_KEY__?: string
    __WIDGET_BASE_URL__?: string
  }
}

function readFromScriptTag(): { key: string; baseUrl: string } | null {
  // `currentScript` points at the <script> still executing (this bundle).
  // Falls back to a broader query in case the bundle was loaded in a way
  // that nulls currentScript (module preload, dynamic import, etc.).
  const cs = document.currentScript as HTMLScriptElement | null
  const tag = cs ?? document.querySelector<HTMLScriptElement>('script[data-site-key]')
  if (!tag) return null
  const key = tag.dataset['siteKey'] ?? tag.getAttribute('data-site-key') ?? ''
  if (key.length === 0) return null
  let baseUrl = ''
  try { baseUrl = new URL(tag.src).origin } catch { /* relative src; leave empty */ }
  return { key, baseUrl }
}

const fromTag = readFromScriptTag()
const SITE_KEY = window.__SITE_KEY__ ?? fromTag?.key
const BASE_URL = window.__WIDGET_BASE_URL__ ?? fromTag?.baseUrl ?? ''

if (!SITE_KEY) {
  console.warn('[llm4agents widget] missing site key — add data-site-key="..." to the <script> tag or set window.__SITE_KEY__ before loading widget.js')
} else {
  mount(SITE_KEY, BASE_URL)
}

function mount(siteKey: string, baseUrl: string): void {
  // Host element — sits in the page DOM but renders into a shadow root
  const host = document.createElement('div')
  host.id = 'llm4agents-widget-host'
  host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;'
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })

  // Inject focus-ring + reduced-motion CSS into the shadow root.
  // The shadow root isolates these styles from the host page — no leakage.
  const style = document.createElement('style')
  style.textContent = [
    'button:focus-visible{outline:2px solid #ffffff;outline-offset:2px;box-shadow:0 0 0 4px rgba(79,70,229,.45);}',
    '@media (prefers-reduced-motion: reduce){button{transition:none !important;}}',
  ].join('')
  shadow.appendChild(style)

  // Launcher button
  const dialogIframeId = 'llm4agents-widget-iframe'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.setAttribute('aria-label', 'Open support chat')
  btn.setAttribute('aria-expanded', 'false')
  btn.setAttribute('aria-haspopup', 'dialog')
  btn.setAttribute('aria-controls', dialogIframeId)
  btn.style.cssText = [
    'width:56px;height:56px;border-radius:50%;border:none;',
    'background:#4f46e5;color:#fff;cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;',
    'box-shadow:0 4px 12px rgba(0,0,0,.25);transition:transform .15s;',
  ].join('')
  setButtonIcon(btn, 'chat')
  shadow.appendChild(btn)

  // iframe — loaded lazily on first open
  let iframe: HTMLIFrameElement | null = null
  let open = false

  btn.addEventListener('click', () => {
    open = !open

    if (!iframe) {
      iframe = createIframe(siteKey, baseUrl, dialogIframeId)
      shadow.appendChild(iframe)
    }

    iframe.style.display = open ? 'block' : 'none'
    btn.setAttribute('aria-expanded', String(open))
    btn.setAttribute('aria-label', open ? 'Close support chat' : 'Open support chat')
    setButtonIcon(btn, open ? 'close' : 'chat')

    if (open) {
      // Move focus into the iframe so keyboard users land inside the dialog
      iframe.focus()
    } else {
      // Return focus to the FAB when the chat is closed
      btn.focus()
    }
  })

  // Allow the embed app to close the widget via postMessage
  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.data === 'llm4agents:close' && iframe) {
      open = false
      iframe.style.display = 'none'
      btn.setAttribute('aria-expanded', 'false')
      setButtonIcon(btn, 'chat')
      // Return focus to the FAB
      btn.focus()
    }
  })
}

function setButtonIcon(btn: HTMLButtonElement, icon: 'chat' | 'close'): void {
  // Build SVG via DOM APIs — no innerHTML with external data, fully static paths
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', '24')
  svg.setAttribute('height', '24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  if (icon === 'chat') {
    path.setAttribute(
      'd',
      'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z',
    )
  } else {
    path.setAttribute('d', 'M6 18L18 6M6 6l12 12')
  }
  svg.appendChild(path)
  // Remove previous children and attach new SVG
  while (btn.firstChild) {
    btn.removeChild(btn.firstChild)
  }
  btn.appendChild(svg)
}

function createIframe(siteKey: string, baseUrl: string, id: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe')
  iframe.id = id
  // Load the static widget shell (embed.html) and pass the site key via query.
  // The shell reads it from location.search at boot — see embed-app.tsx.
  iframe.src = `${baseUrl}/embed.html?siteKey=${encodeURIComponent(siteKey)}`
  iframe.title = 'Support chat'
  iframe.allow = 'clipboard-write'
  iframe.style.cssText = [
    'position:absolute;bottom:70px;right:0;',
    'width:380px;height:600px;',
    'border:none;border-radius:16px;',
    'box-shadow:0 8px 32px rgba(0,0,0,.18);',
    'background:#fff;',
  ].join('')
  return iframe
}
