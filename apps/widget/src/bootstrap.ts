/**
 * bootstrap.ts — vanilla DOM bootstrap script (IIFE build).
 *
 * Injected by the site owner as a single <script src="/widget.js"> tag.
 * Reads window.__SITE_KEY__ (set by the backend's /embed/:siteKey template),
 * creates a shadow root to isolate styles, then mounts a launcher button +
 * an iframe that loads the full Preact embed app.
 */

// Make this file a module so the global augmentation is valid
export {}

declare global {
  interface Window {
    __SITE_KEY__?: string
    __WIDGET_BASE_URL__?: string
  }
}

const SITE_KEY = window.__SITE_KEY__
const BASE_URL = window.__WIDGET_BASE_URL__ ?? ''

if (!SITE_KEY) {
  // End-user-facing diagnostic: tells the site owner their snippet is misconfigured.
  console.warn('[llm4agents widget] missing __SITE_KEY__ — widget disabled')
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

  // Launcher button
  const btn = document.createElement('button')
  btn.setAttribute('aria-label', 'Open support chat')
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
      iframe = createIframe(siteKey, baseUrl)
      shadow.appendChild(iframe)
    }

    iframe.style.display = open ? 'block' : 'none'
    btn.setAttribute('aria-expanded', String(open))
    setButtonIcon(btn, open ? 'close' : 'chat')
  })

  // Allow the embed app to close the widget via postMessage
  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.data === 'llm4agents:close' && iframe) {
      open = false
      iframe.style.display = 'none'
      btn.setAttribute('aria-expanded', 'false')
      setButtonIcon(btn, 'chat')
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

function createIframe(siteKey: string, baseUrl: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe')
  iframe.src = `${baseUrl}/embed/${siteKey}`
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
