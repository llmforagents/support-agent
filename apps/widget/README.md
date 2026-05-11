# Widget

The end-user chat widget. Ships as two builds from a single source:

- `widget.js` — vanilla IIFE bootstrap that creates a **closed shadow DOM** on the host page and lazy-loads the chat UI inside an iframe.
- `embed.html` + `assets/*` — the Preact app the iframe renders.

Site owners typically install just the bootstrap:

```html
<script src="https://your-domain/widget.js" data-site-key="..."></script>
```

## Accessibility note

The widget renders inside a **closed shadow DOM** by default to isolate styles from the host page. This means most browser extensions (Lighthouse, axe DevTools, some screen-reader add-ons) can't pierce the shadow boundary and won't audit the widget's internals when installed on third-party sites.

We've shipped WCAG AA-compliant markup, keyboard navigation, focus management, and color contrast inside the shadow root — but if you need an opt-out (e.g. to debug with axe DevTools on a production page), the build also produces an **iframe variant** that renders the chat UI in an isolated same-origin `<iframe>` with the same component surface. Switch to it by pointing your embed at `/embed/:siteKey` directly (rendered to a sandbox iframe of your choice) instead of including `widget.js`.

Both builds pass `@axe-core/playwright` against WCAG 2 AA (see `e2e/tests/widgetA11y.spec.ts`).

### What we ship in-widget

- `role="dialog" aria-modal="false"` on the chat panel; `aria-labelledby` points at a hidden title.
- `role="log" aria-live="polite"` on the message list. Each visitor / agent / operator bubble is wrapped in `role="article"` with an i18n'd `aria-label`.
- System events use `role="status" aria-live="polite"` for assistive-tech announcements.
- The status badge in the header is `role="status" aria-live="polite"` so handoff / operator-connected transitions are announced.
- The input has a programmatic label via `useId()` + `sr-only` `<label>`. The character counter is `aria-describedby` for the input.
- Visible focus rings on every interactive element — `:focus-visible { outline: 2px solid … }` (white-on-primary in the header for contrast).
- ESC closes the panel; Enter sends (Shift+Enter inserts newline).
- `prefers-reduced-motion` disables animations and smooth-scroll.

The trigger FAB (closed state, rendered in the shadow root) exposes `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls` pointing at the iframe ID so screen readers can announce the relationship.

## Build

```bash
pnpm --filter widget build
```

Produces both bundles under `dist/`. The backend serves them via the `widgetAssets` route.
