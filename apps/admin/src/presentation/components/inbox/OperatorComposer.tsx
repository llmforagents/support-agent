import { useState, useId, type FormEvent } from 'react'
import { Button } from '@/presentation/components/ui/button'

type Props = {
  readonly disabled: boolean
  readonly onSend: (content: string) => Promise<void>
}

export function OperatorComposer({ disabled, onSend }: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const textareaId = useId()

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

  const placeholder = disabled
    ? 'Reclamá la conversación para responder'
    : 'Escribí un mensaje…'

  return (
    <form
      onSubmit={(e) => { void submit(e) }}
      className="border-t border-zinc-200 bg-white p-3"
      aria-label="Composer del operador"
    >
      <label htmlFor={textareaId} className="sr-only">
        Mensaje del operador
      </label>
      <textarea
        id={textareaId}
        value={text}
        onChange={(e) => { setText(e.currentTarget.value) }}
        disabled={disabled || busy}
        placeholder={placeholder}
        rows={2}
        maxLength={4000}
        className={[
          // gray-900 text on white for AA. placeholder-zinc-500 = 4.7:1 (AA pass).
          'w-full rounded border border-zinc-400 p-2 text-sm text-zinc-900 placeholder:text-zinc-500',
          'focus:border-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
          'disabled:bg-zinc-50',
        ].join(' ')}
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
