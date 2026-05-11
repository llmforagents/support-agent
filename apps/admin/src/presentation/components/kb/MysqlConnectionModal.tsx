import { useState, useEffect, useId, useRef, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/infrastructure/apiClient'
import { Card } from '@/presentation/components/ui/card'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import { Button } from '@/presentation/components/ui/button'

type CreatedConnection = {
  readonly id: string
  readonly name: string
}

type Props = {
  readonly onClose: () => void
  readonly onCreated: (connection: CreatedConnection) => void
}

type FormState = {
  readonly name: string
  readonly host: string
  readonly port: number
  readonly database: string
  readonly user: string
  readonly password: string
  readonly ssl: boolean
}

export function MysqlConnectionModal({ onClose, onCreated }: Props): React.JSX.Element {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>({
    name: '',
    host: '',
    port: 3306,
    database: '',
    user: '',
    password: '',
    ssl: true,
  })
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const nameId = useId()
  const hostId = useId()
  const portId = useId()
  const dbId = useId()
  const userId = useId()
  const passId = useId()
  const sslId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<Element | null>(null)

  const create = useMutation({
    mutationFn: () => apiClient.mysqlConnectionCreate(form),
    onSuccess: (conn) => {
      void qc.invalidateQueries({ queryKey: ['mysql-connections'] })
      onCreated({ id: conn.id, name: conn.name })
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Error al crear la conexión')
    },
  })

  useEffect(() => {
    previousFocusRef.current = document.activeElement
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('input')
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
    setError(null)
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
      <Card className="w-full max-w-md space-y-4 p-6">
        <h2 id={titleId} className="text-xl font-semibold text-zinc-900">Conectar MySQL</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor={nameId}>Nombre</Label>
            <Input
              id={nameId}
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.currentTarget.value }) }}
              required
            />
          </div>
          <div>
            <Label htmlFor={hostId}>Host</Label>
            <Input
              id={hostId}
              value={form.host}
              onChange={(e) => { setForm({ ...form, host: e.currentTarget.value }) }}
              required
            />
          </div>
          <div>
            <Label htmlFor={portId}>Puerto</Label>
            <Input
              id={portId}
              type="number"
              value={form.port}
              onChange={(e) => { setForm({ ...form, port: Number(e.currentTarget.value) }) }}
              required
              min={1}
              max={65535}
            />
          </div>
          <div>
            <Label htmlFor={dbId}>Base de datos</Label>
            <Input
              id={dbId}
              value={form.database}
              onChange={(e) => { setForm({ ...form, database: e.currentTarget.value }) }}
              required
            />
          </div>
          <div>
            <Label htmlFor={userId}>Usuario</Label>
            <Input
              id={userId}
              value={form.user}
              onChange={(e) => { setForm({ ...form, user: e.currentTarget.value }) }}
              autoComplete="off"
              required
            />
          </div>
          <div>
            <Label htmlFor={passId}>Contraseña</Label>
            <Input
              id={passId}
              type="password"
              value={form.password}
              onChange={(e) => { setForm({ ...form, password: e.currentTarget.value }) }}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id={sslId}
              type="checkbox"
              checked={form.ssl}
              onChange={(e) => { setForm({ ...form, ssl: e.currentTarget.checked }) }}
              className="h-4 w-4 rounded border-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <Label htmlFor={sslId}>SSL</Label>
          </div>
          {error !== null && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creando…' : 'Crear conexión'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
