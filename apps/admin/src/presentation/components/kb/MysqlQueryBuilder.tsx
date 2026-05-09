import { useState, type FormEvent } from 'react'
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

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    setSubmitError(null)
    create.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-2xl space-y-4 p-6">
        <h2 className="text-xl font-semibold">Source MySQL</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="mqb-name">Nombre</Label>
            <Input
              id="mqb-name"
              value={name}
              onChange={(e) => { setName(e.currentTarget.value) }}
              required
            />
          </div>
          <div>
            <Label htmlFor="mqb-query">Query SQL</Label>
            <textarea
              id="mqb-query"
              value={query}
              onChange={(e) => { setQuery(e.currentTarget.value) }}
              required
              rows={4}
              className="w-full rounded border border-zinc-300 p-2 font-mono text-xs focus:border-indigo-500 focus:outline-none"
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
              <p className="mt-1 text-xs">{validationMsg}</p>
            )}
          </div>
          <div>
            <Label htmlFor="mqb-tpl">Template por fila</Label>
            <textarea
              id="mqb-tpl"
              value={rowTemplate}
              onChange={(e) => { setRowTemplate(e.currentTarget.value) }}
              required
              rows={3}
              className="w-full rounded border border-zinc-300 p-2 font-mono text-xs focus:border-indigo-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Tokens disponibles: cualquier columna devuelta por la query como {'{{column}}'}.
            </p>
          </div>
          {submitError !== null && <p className="text-sm text-red-600">{submitError}</p>}
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
