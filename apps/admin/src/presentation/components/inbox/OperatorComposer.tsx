import { useState, type FormEvent } from 'react'
import { Button } from '@/presentation/components/ui/button'

type Props = {
  readonly disabled: boolean
  readonly onSend: (content: string) => Promise<void>
}

export function OperatorComposer({ disabled, onSend }: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await onSend(trimmed)
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => { void submit(e) }} className="border-t border-zinc-200 bg-white p-3">
      <textarea
        value={text}
        onChange={(e) => { setText(e.currentTarget.value) }}
        disabled={disabled || busy}
        placeholder={
          disabled
            ? 'Reclamá la conversación para responder'
            : 'Escribí un mensaje…'
        }
        rows={2}
        maxLength={4000}
        className="w-full rounded border border-zinc-300 p-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-zinc-50"
      />
      <div className="mt-2 flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={disabled || busy || text.trim().length === 0}
        >
          {busy ? 'Enviando…' : 'Enviar'}
        </Button>
      </div>
    </form>
  )
}
