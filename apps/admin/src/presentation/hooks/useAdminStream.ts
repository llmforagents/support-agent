import { useEffect, useRef } from 'react'

type AdminEvent = {
  readonly type: string
  readonly [k: string]: unknown
}

/**
 * Subscribes to the admin SSE stream at /v1/admin/stream and calls `onEvent`
 * for every parsed event. The browser handles reconnection automatically.
 * The hook closes the EventSource when the component unmounts.
 */
export function useAdminStream(onEvent: (event: AdminEvent) => void): void {
  // Keep a stable ref so we never have to re-subscribe when the callback changes.
  const cb = useRef(onEvent)
  cb.current = onEvent

  useEffect(() => {
    const es = new EventSource('/v1/admin/stream')

    es.onmessage = (m: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(m.data)
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'type' in parsed &&
          typeof (parsed as Record<string, unknown>)['type'] === 'string'
        ) {
          cb.current(parsed as AdminEvent)
        }
      } catch {
        // malformed SSE data — ignore
      }
    }

    es.onerror = () => {
      // The browser automatically reconnects on error; no action needed here.
    }

    return () => {
      es.close()
    }
  }, []) // empty deps — we want exactly one EventSource per mount
}
