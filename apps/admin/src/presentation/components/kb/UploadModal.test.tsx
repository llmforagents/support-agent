import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { UploadModal } from './UploadModal'

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
    sourceCreate: vi.fn(),
    sourcesList: vi.fn(),
  },
}))

function renderModal(onClose = vi.fn()): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <UploadModal onClose={onClose} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('UploadModal', () => {
  it('renders title, file input, name input, type select and action buttons', () => {
    renderModal()
    expect(screen.getByText(/subir documento|upload document/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/archivo|file/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/nombre|name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/tipo|type/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar|cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /subir|upload/i })).toBeInTheDocument()
  })

  it('submit button is disabled when no file is selected', () => {
    renderModal()
    const submit = screen.getByRole('button', { name: /subir|upload/i })
    expect(submit).toBeDisabled()
  })

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn()
    renderModal(onClose)
    fireEvent.click(screen.getByRole('button', { name: /cancelar|cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('auto-detects pdf type when a .pdf file is selected', () => {
    renderModal()
    const fileInput = screen.getByLabelText(/archivo|file/i) as HTMLInputElement
    const pdfFile = new File(['%PDF-1.4 content'], 'manual.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [pdfFile] } })
    const select = screen.getByLabelText(/tipo|type/i) as HTMLSelectElement
    expect(select.value).toBe('pdf')
    const nameInput = screen.getByLabelText(/nombre|name/i) as HTMLInputElement
    expect(nameInput.value).toBe('manual')
  })

  it('auto-detects md type when a .md file is selected', () => {
    renderModal()
    const fileInput = screen.getByLabelText(/archivo|file/i) as HTMLInputElement
    const mdFile = new File(['# Hello'], 'readme.md', { type: 'text/markdown' })
    fireEvent.change(fileInput, { target: { files: [mdFile] } })
    const select = screen.getByLabelText(/tipo|type/i) as HTMLSelectElement
    expect(select.value).toBe('md')
  })
})
