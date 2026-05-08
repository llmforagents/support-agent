const BASE = '/v1/admin'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as Record<string, unknown>)['error'])
        : String(body)
    super(message)
    this.name = 'ApiError'
  }
}

function readCsrfCookie(): string {
  const m = /(?:^|;\s*)csrf=([0-9a-f]+)/.exec(document.cookie)
  return m?.[1] ?? ''
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const extraHeaders: Record<string, string> = {}
  if (init.body !== undefined && !(init.headers instanceof Headers) && !(init.headers as Record<string, string>)?.['Content-Type']) {
    extraHeaders['Content-Type'] = 'application/json'
  }
  if (method !== 'GET' && method !== 'HEAD') {
    extraHeaders['X-CSRF-Token'] = readCsrfCookie()
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...extraHeaders,
    },
  })
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null)
    throw new ApiError(res.status, body)
  }
  return res.json() as Promise<T>
}

export type Source = {
  readonly id: string
  readonly name: string
  readonly sourceType: 'pdf' | 'md' | 'txt' | 'mysql_query'
  readonly config: Readonly<Record<string, unknown>>
  readonly state: {
    readonly status: 'idle' | 'ingesting' | 'ready' | 'error' | 'paused'
    readonly [k: string]: unknown
  }
  readonly active: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export type ChunkPreview = {
  readonly id: string
  readonly sourceId: string
  readonly sourceName: string
  readonly text: string
  readonly score: number
  readonly metadata: Readonly<Record<string, unknown>>
}

export const apiClient = {
  get<T>(path: string): Promise<T> {
    return request<T>(path)
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method: 'POST' }
    if (body !== undefined) init.body = JSON.stringify(body)
    return request<T>(path, init)
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method: 'PUT' }
    if (body !== undefined) init.body = JSON.stringify(body)
    return request<T>(path, init)
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' })
  },

  // ── Knowledge base ──────────────────────────────────────────────────────────
  sourcesList(): Promise<{ readonly sources: readonly Source[] }> {
    return request('/sources')
  },
  sourceGet(id: string): Promise<Source> {
    return request(`/sources/${id}`)
  },
  async sourceCreate(file: File, name: string, type: 'pdf' | 'md' | 'txt'): Promise<Source> {
    const fd = new FormData()
    fd.append('name', name)
    fd.append('type', type)
    fd.append('file', file)
    const res = await fetch(`${BASE}/sources`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': readCsrfCookie() },
      body: fd,
    })
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null)
      throw new ApiError(res.status, body)
    }
    return res.json() as Promise<Source>
  },
  sourceReindex(id: string): Promise<{ readonly ok: true }> {
    return request(`/sources/${id}/reindex`, { method: 'POST' })
  },
  sourceSetActive(id: string, active: boolean): Promise<{ readonly ok: true }> {
    return request(`/sources/${id}/active`, {
      method: 'PUT',
      body: JSON.stringify({ active }),
    })
  },
  sourceDelete(id: string): Promise<{ readonly ok: true }> {
    return request(`/sources/${id}`, { method: 'DELETE' })
  },
  sourcePreview(id: string, n = 5): Promise<{ readonly chunks: readonly ChunkPreview[] }> {
    return request(`/sources/${id}/preview?n=${n}`)
  },
}
