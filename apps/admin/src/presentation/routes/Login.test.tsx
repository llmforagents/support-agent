import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ReactRouterDom from 'react-router-dom'
import { AuthProvider } from '@/presentation/hooks/useAuth'
import { Login } from './Login'
import { ApiError } from '@/infrastructure/apiClient'

const mockPost = vi.fn()
const mockGet = vi.fn()

// Mock the API client module — all functions delegated to stable mock refs
vi.mock('@/infrastructure/apiClient', () => ({
  ApiError: class ApiError extends Error {
    public status: number
    constructor(status: number, message: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  },
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDom>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderLogin(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: /auth/me returns 401 (unauthenticated)
    mockGet.mockRejectedValue(new ApiError(401, 'Unauthorized'))
  })

  it('renders the login form', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: /admin login/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('calls login and navigates on success', async () => {
    mockPost.mockResolvedValue({ ok: true })
    mockGet.mockResolvedValueOnce({ email: 'admin@example.com' })

    renderLogin()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'admin@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/auth/login', {
        email: 'admin@example.com',
        password: 'secret123',
      })
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/conversations')
    })
  })

  it('shows error message on 401', async () => {
    mockPost.mockRejectedValue(new ApiError(401, 'Unauthorized'))

    renderLogin()

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'bad@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpass' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i)
    })
  })
})
