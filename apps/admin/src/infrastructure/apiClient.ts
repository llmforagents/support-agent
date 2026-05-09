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

export type Session = {
  readonly id: string
  readonly visitorId: string
  readonly state: { readonly status: string; readonly [k: string]: unknown }
  readonly visitorMeta: { readonly url?: string; readonly userAgent?: string; readonly language?: string }
  readonly totalCostCents: number
  readonly createdAt: string
  readonly lastActivityAt: string
  readonly closedAt?: string
}

export type Message = {
  readonly id: string
  readonly sessionId: string
  readonly role: 'visitor' | 'assistant' | 'operator' | 'system_event'
  readonly content: string
  readonly costCents: number
  readonly createdAt: string
  readonly ragHits?: ReadonlyArray<{ readonly id: string; readonly sourceId: string; readonly score: number }>
}

export type MysqlConnection = {
  readonly id: string
  readonly name: string
  readonly host: string
  readonly port: number
  readonly database: string
  readonly user: string
  readonly ssl: boolean
  readonly createdAt: string
  readonly updatedAt: string
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

  // ── Inbox / Sessions ────────────────────────────────────────────────────────
  sessionsList(status?: string): Promise<{ readonly sessions: readonly Session[] }> {
    return request(
      status !== undefined
        ? `/sessions?status=${encodeURIComponent(status)}`
        : '/sessions',
    )
  },
  sessionGet(id: string): Promise<Session> {
    return request(`/sessions/${id}`)
  },
  sessionMessages(
    id: string,
    opts?: { readonly limit?: number; readonly afterId?: string },
  ): Promise<{ readonly messages: readonly Message[] }> {
    const qs = new URLSearchParams()
    if (opts?.limit !== undefined) qs.set('limit', String(opts.limit))
    if (opts?.afterId !== undefined) qs.set('afterId', opts.afterId)
    const q = qs.toString()
    return request(`/sessions/${id}/messages${q ? `?${q}` : ''}`)
  },
  sessionClaim(id: string): Promise<{ readonly ok: true }> {
    return request(`/sessions/${id}/claim`, { method: 'POST' })
  },
  sessionRelease(id: string): Promise<{ readonly ok: true }> {
    return request(`/sessions/${id}/release`, { method: 'POST' })
  },
  sessionClose(id: string): Promise<{ readonly ok: true }> {
    return request(`/sessions/${id}/close`, { method: 'POST' })
  },
  sessionSendOperatorMessage(id: string, content: string): Promise<{ readonly ok: true }> {
    return request(`/sessions/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  },

  // ── MySQL connections ────────────────────────────────────────────────────────
  mysqlConnectionsList(): Promise<{ readonly connections: readonly MysqlConnection[] }> {
    return request('/mysql-connections')
  },
  mysqlConnectionCreate(input: {
    readonly name: string
    readonly host: string
    readonly port: number
    readonly database: string
    readonly user: string
    readonly password: string
    readonly ssl: boolean
  }): Promise<MysqlConnection> {
    return request('/mysql-connections', { method: 'POST', body: JSON.stringify(input) })
  },
  mysqlConnectionDelete(id: string): Promise<{ readonly ok: true }> {
    return request(`/mysql-connections/${id}`, { method: 'DELETE' })
  },
  mysqlConnectionTest(id: string): Promise<{ readonly ok: boolean; readonly error?: string }> {
    return request(`/mysql-connections/${id}/test`, { method: 'POST' })
  },
  mysqlValidateQuery(
    id: string,
    query: string,
  ): Promise<{ readonly ok: boolean; readonly reason?: string; readonly safeSql?: string }> {
    return request(`/mysql-connections/${id}/validate-query`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    })
  },
  sourceCreateMysql(input: {
    readonly name: string
    readonly connectionId: string
    readonly query: string
    readonly rowTemplate: string
  }): Promise<Source> {
    return request('/sources', {
      method: 'POST',
      body: JSON.stringify({ ...input, sourceType: 'mysql_query' }),
    })
  },
}
