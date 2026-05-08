/**
 * apiClient.ts — typed HTTP client for widget → backend calls.
 *
 * All requests go to the backend's /v1/widget/* namespace.
 * The visitor id is persisted in localStorage and injected as a header.
 */

import type { Result } from '../types'
import { Ok, Err } from '../types'

export type ApiError =
  | { kind: 'network'; message: string }
  | { kind: 'http'; status: number; body: string }
  | { kind: 'parse'; message: string }

export type WidgetConfig = Readonly<{
  siteKey: string
  siteName: string
  primaryColor: string
  adminOnline: boolean
}>

export type CreateSessionResponse = Readonly<{
  sessionId: string
  streamToken: string
}>

export type PostMessageResponse = Readonly<{
  ok: boolean
  streamToken: string
}>

const BASE = '/v1/widget'

async function request<T>(
  method: string,
  path: string,
  visitorId: string,
  body?: unknown,
): Promise<Result<T, ApiError>> {
  const headers: Record<string, string> = {
    'X-Visitor-Id': visitorId,
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, init)
  } catch (err) {
    return Err({ kind: 'network', message: err instanceof Error ? err.message : String(err) })
  }

  if (!res.ok) {
    let bodyText = res.statusText
    try {
      bodyText = await res.text()
    } catch {
      // ignore read error
    }
    return Err({ kind: 'http', status: res.status, body: bodyText })
  }

  let data: T
  try {
    data = (await res.json()) as T
  } catch (err) {
    return Err({ kind: 'parse', message: err instanceof Error ? err.message : String(err) })
  }

  return Ok(data)
}

export function makeApiClient(visitorId: string) {
  return {
    getConfig(siteKey: string): Promise<Result<WidgetConfig, ApiError>> {
      return request<WidgetConfig>('GET', `/config?siteKey=${encodeURIComponent(siteKey)}`, visitorId)
    },

    createSession(input: {
      url?: string
      userAgent?: string
      language?: string
    }): Promise<Result<CreateSessionResponse, ApiError>> {
      return request<CreateSessionResponse>('POST', '/sessions', visitorId, input)
    },

    postMessage(
      sessionId: string,
      content: string,
    ): Promise<Result<PostMessageResponse, ApiError>> {
      return request<PostMessageResponse>('POST', `/sessions/${sessionId}/messages`, visitorId, { content })
    },

    closeSession(sessionId: string): Promise<Result<{ ok: boolean }, ApiError>> {
      return request<{ ok: boolean }>('POST', `/sessions/${sessionId}/close`, visitorId)
    },
  }
}

export type ApiClient = ReturnType<typeof makeApiClient>
