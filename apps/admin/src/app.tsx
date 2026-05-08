import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/presentation/hooks/useAuth'
import { Login } from '@/presentation/routes/Login'

function Conversations(): React.JSX.Element {
  return <div className="p-8">Conversations (stub)</div>
}

export function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/" element={<Login />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
