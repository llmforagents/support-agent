import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiClient } from '@/infrastructure/apiClient'
import { McpToggle } from './McpToggle'

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
    configGet: vi.fn(),
    mcpSetEnabled: vi.fn(),
  },
}))

const mockedConfigGet = vi.mocked(apiClient.configGet)
const mockedMcpSetEnabled = vi.mocked(apiClient.mcpSetEnabled)

function renderToggle(): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <McpToggle />
    </QueryClientProvider>,
  )
}

describe('McpToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the current mcpEnabled=false state', async () => {
    mockedConfigGet.mockResolvedValue({ mcpEnabled: false })
    renderToggle()
    const sw = await screen.findByRole('switch', { name: /activar acceso al mcp|enable mcp access/i })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/desactivado|disabled/i)).toBeInTheDocument()
  })

  it('renders the current mcpEnabled=true state', async () => {
    mockedConfigGet.mockResolvedValue({ mcpEnabled: true })
    renderToggle()
    const sw = await screen.findByRole('switch', { name: /activar acceso al mcp|enable mcp access/i })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/^activo$|^enabled$/i)).toBeInTheDocument()
  })

  it('opens the confirmation dialog before mutating', async () => {
    mockedConfigGet.mockResolvedValue({ mcpEnabled: false })
    renderToggle()
    const sw = await screen.findByRole('switch', { name: /activar acceso al mcp|enable mcp access/i })
    fireEvent.click(sw)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText(/¿activar mcp\?|enable mcp\?/i)).toBeInTheDocument()
    // Mutation must NOT have fired yet — only after confirm.
    expect(mockedMcpSetEnabled).not.toHaveBeenCalled()
  })

  it('cancel closes the dialog without firing the mutation', async () => {
    mockedConfigGet.mockResolvedValue({ mcpEnabled: false })
    renderToggle()
    const sw = await screen.findByRole('switch', { name: /activar acceso al mcp|enable mcp access/i })
    fireEvent.click(sw)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: /cancelar|cancel/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(mockedMcpSetEnabled).not.toHaveBeenCalled()
  })

  it('confirming calls mcpSetEnabled with the new value', async () => {
    mockedConfigGet.mockResolvedValue({ mcpEnabled: false })
    mockedMcpSetEnabled.mockResolvedValue({ mcpEnabled: true })
    renderToggle()
    const sw = await screen.findByRole('switch', { name: /activar acceso al mcp|enable mcp access/i })
    fireEvent.click(sw)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: /confirmar|confirm/i }))
    await waitFor(() => {
      expect(mockedMcpSetEnabled).toHaveBeenCalledWith(true)
    })
  })
})
