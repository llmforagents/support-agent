import '@testing-library/jest-dom'

// jsdom does not implement scrollIntoView — stub it so ChatPanel's auto-scroll
// useEffect doesn't throw in tests
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = (): void => { /* noop in jsdom */ }
}
