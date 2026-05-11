import { useState, useEffect, useId, useRef, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/infrastructure/apiClient'
import { Card } from '@/presentation/components/ui/card'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'

type Props = {
  readonly connectionId: string
  readonly connectionName: string
  readonly onClose: () => void
}

export function MysqlQueryBuilder({ connectionId, connectionName, onClose }: Props): React.JSX.Element {
  const qc = useQueryClient()
  const [name, setName] = useState(`MySQL: ${connectionName}`)
  const [query, setQuery] = useState('SELECT id, question, answer FROM faqs')
  const [rowTemplate, setRowTemplate] = useState('Q: {{question}}\nA: {{answer}}')
  const [validationMsg, setValidationMsg] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const titleId = useId()
  const nameId = useId()
  const queryId = useId()
  const tplId = useId()
  const validationId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<Element | null>(null)

  const validate = useMutation({
    mutationFn: () => apiClient.mysqlValidateQuery(connectionId, query),
    onSuccess: (r) => {
      setValidationMsg(r.ok ? '✓ Query válida' : `✗ ${r.reason ?? 'inválida'}`)
    },
    onError: (err: unknown) => {
      setValidationMsg(`✗ ${err instanceof Error ? err.message : 'error al validar'}`)
    },
  })

  const create = useMutation({
    mutationFn: () =>
      apiClient.sourceCreateMysql({ name, connectionId, query, rowTemplate }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sources'] })
      onClose()
    },
    onError: (err: unknown) => {
      setSubmitError(err instanceof Error ? err.message : 'Error al crear el source')
    },
  })

  useEffect(() => {
    previousFocusRef.current = document.activeElement
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('input, textarea, button')
    firstFocusable?.focus()
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    setSubmitError(null)
    create.mutate()
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <Card className="w-full max-w-2xl space-y-4 p-6">
        <h2 id={titleId} className="text-xl font-semibold text-zinc-900">Source MySQL</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor={nameId}>Nombre</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => { setName(e.currentTarget.value) }}
              required
            />
          </div>
          <div>
            <Label htmlFor={queryId}>Query SQL</Label>
            <textarea
              id={queryId}
              value={query}
              onChange={(e) => { setQuery(e.currentTarget.value) }}
              required
              rows={4}
              aria-describedby={validationMsg !== null ? validationId : undefined}
              className="w-full rounded border border-zinc-400 p-2 font-mono text-xs text-zinc-900 focus:border-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { validate.mutate() }}
              disabled={validate.isPending}
              className="mt-1"
            >
              {validate.isPending ? 'Validando…' : 'Validar query'}
            </Button>
            {validationMsg !== null && (
              <p
                id={validationId}
                role="status"
                aria-live="polite"
                className="mt-1 text-xs text-zinc-800"
              >
                {validationMsg}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor={tplId}>Template por fila</Label>
            <textarea
              id={tplId}
              value={rowTemplate}
              onChange={(e) => { setRowTemplate(e.currentTarget.value) }}
              required
              rows={3}
              className="w-full rounded border border-zinc-400 p-2 font-mono text-xs text-zinc-900 focus:border-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            {/* zinc-600 = 7.1:1 on white — passes AA. zinc-500 was borderline. */}
            <p className="mt-1 text-xs text-zinc-600">
              Tokens disponibles: cualquier columna devuelta por la query como {'{{column}}'}.
            </p>
          </div>
          {submitError !== null && (
            <p role="alert" className="text-sm text-red-700">{submitError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creando…' : 'Crear source'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
