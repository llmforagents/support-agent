import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SourceDetail } from './SourceDetail'
import type { Source } from '@/infrastructure/apiClient'

const mockSourceGet = vi.fn()
const mockSourcePreview = vi.fn()

vi.mock('@/infrastructure/apiClient', () => ({
  ApiError: class ApiError extends Error {
    public status: number
    public body: unknown
    constructor(status: number, body: unknown) {
      super(String(body))
      this.name = 'ApiError'
      this.status = status
      this.body = body
    }
  },
  apiClient: {
    sourceGet: (...args: unknown[]) => mockSourceGet(...args),
    sourcePreview: (...args: unknown[]) => mockSourcePreview(...args),
  },
}))

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 'src-1',
    name: 'Product Manual',
    sourceType: 'pdf',
    config: { type: 'pdf', fileRef: 'ref-abc' },
    state: { status: 'ready', chunkCount: 12 },
    active: true,
    createdAt: '2026-05-08T00:00:00Z',
    updatedAt: '2026-05-08T00:00:00Z',
    ...overrides,
  }
}

function renderDetail(sourceId = 'src-1', onClose = vi.fn()): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <SourceDetail sourceId={sourceId} onClose={onClose} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('SourceDetail', () => {
  it('shows loading placeholder while data is fetched', () => {
    mockSourceGet.mockReturnValue(new Promise(() => undefined))
    renderDetail()
    // Name placeholder shown while loading
    expect(screen.getByText('…')).toBeInTheDocument()
    // Close button always visible
    expect(screen.getByRole('button', { name: /cerrar|close/i })).toBeInTheDocument()
  })

  it('renders source name, type, and status once loaded', async () => {
    mockSourceGet.mockResolvedValue(makeSource())
    mockSourcePreview.mockResolvedValue({ chunks: [] })
    renderDetail()
    expect(await screen.findByText('Product Manual')).toBeInTheDocument()
    expect(screen.getByText(/PDF/i)).toBeInTheDocument()
    expect(screen.getByText(/ready/i)).toBeInTheDocument()
  })

  it('shows chunk count for a ready source', async () => {
    mockSourceGet.mockResolvedValue(makeSource({ state: { status: 'ready', chunkCount: 42 } }))
    mockSourcePreview.mockResolvedValue({ chunks: [] })
    renderDetail()
    expect(await screen.findByText(/42/)).toBeInTheDocument()
  })

  it('shows error text for an errored source', async () => {
    mockSourceGet.mockResolvedValue(
      makeSource({ state: { status: 'error', error: { kind: 'pdf_encrypted' } } }),
    )
    renderDetail()
    expect(await screen.findByText(/pdf_encrypted/i)).toBeInTheDocument()
  })

  it('renders chunk preview when source is ready and preview data arrives', async () => {
    mockSourceGet.mockResolvedValue(makeSource())
    mockSourcePreview.mockResolvedValue({
      chunks: [
        { id: 'c1', sourceId: 'src-1', sourceName: 'Product Manual', text: 'Hello world', score: 0.9, metadata: {} },
      ],
    })
    renderDetail()
    expect(await screen.findByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('[Product Manual]')).toBeInTheDocument()
  })
})
