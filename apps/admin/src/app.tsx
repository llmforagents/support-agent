import { BrowserRouter, Routes, Route } from 'react-router-dom'

function Home(): React.JSX.Element {
  return <div className="p-8 text-xl font-semibold">LLM4Agents Support Admin</div>
}

function Conversations(): React.JSX.Element {
  return <div className="p-8">Conversations (stub)</div>
}

export function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/conversations" element={<Conversations />} />
      </Routes>
    </BrowserRouter>
  )
}
