import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { Header } from './Header'

const BASE_PROPS = {
  siteName: 'Acme Support',
  primaryColor: '#4f46e5',
  onClose: vi.fn(),
}

describe('Header', () => {
  it('shows online label when adminOnline=true and no conversationStatus', () => {
    render(<Header {...BASE_PROPS} adminOnline={true} />)
    // Matches the statusOnline i18n key — English or Spanish
    expect(screen.getByText(/en línea|online/i)).toBeInTheDocument()
  })

  it('shows offline label when adminOnline=false and no conversationStatus', () => {
    render(<Header {...BASE_PROPS} adminOnline={false} />)
    // Matches statusOffline i18n key
    expect(screen.getByText(/respondemos pronto|we'll reply soon/i)).toBeInTheDocument()
  })

  it('shows handoff_requested label when conversationStatus is handoff_requested', () => {
    render(<Header {...BASE_PROPS} adminOnline={true} conversationStatus="handoff_requested" />)
    // Matches statusHandoff i18n key
    expect(screen.getByText(/buscando un operador|looking for an operator/i)).toBeInTheDocument()
  })

  it('shows active_operator label when conversationStatus is active_operator', () => {
    render(<Header {...BASE_PROPS} adminOnline={true} conversationStatus="active_operator" />)
    // Matches statusOperator i18n key
    expect(screen.getByText(/operador conectado|operator connected/i)).toBeInTheDocument()
  })

  it('conversationStatus active_operator overrides adminOnline=false', () => {
    render(<Header {...BASE_PROPS} adminOnline={false} conversationStatus="active_operator" />)
    expect(screen.getByText(/operador conectado|operator connected/i)).toBeInTheDocument()
  })

  it('renders site name', () => {
    render(<Header {...BASE_PROPS} adminOnline={true} />)
    expect(screen.getByText('Acme Support')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<Header {...BASE_PROPS} adminOnline={true} onClose={onClose} />)
    screen.getByRole('button', { name: /close|cerrar/i }).click()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
