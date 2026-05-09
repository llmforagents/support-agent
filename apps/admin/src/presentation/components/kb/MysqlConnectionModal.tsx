import { useState, type FormEvent } from 'react'
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

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    setError(null)
    create.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-md space-y-4 p-6">
        <h2 className="text-xl font-semibold">Conectar MySQL</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="mc-name">Nombre</Label>
            <Input
              id="mc-name"
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.currentTarget.value }) }}
              required
            />
          </div>
          <div>
            <Label htmlFor="mc-host">Host</Label>
            <Input
              id="mc-host"
              value={form.host}
              onChange={(e) => { setForm({ ...form, host: e.currentTarget.value }) }}
              required
            />
          </div>
          <div>
            <Label htmlFor="mc-port">Puerto</Label>
            <Input
              id="mc-port"
              type="number"
              value={form.port}
              onChange={(e) => { setForm({ ...form, port: Number(e.currentTarget.value) }) }}
              required
              min={1}
              max={65535}
            />
          </div>
          <div>
            <Label htmlFor="mc-db">Base de datos</Label>
            <Input
              id="mc-db"
              value={form.database}
              onChange={(e) => { setForm({ ...form, database: e.currentTarget.value }) }}
              required
            />
          </div>
          <div>
            <Label htmlFor="mc-user">Usuario</Label>
            <Input
              id="mc-user"
              value={form.user}
              onChange={(e) => { setForm({ ...form, user: e.currentTarget.value }) }}
              required
            />
          </div>
          <div>
            <Label htmlFor="mc-pass">Contraseña</Label>
            <Input
              id="mc-pass"
              type="password"
              value={form.password}
              onChange={(e) => { setForm({ ...form, password: e.currentTarget.value }) }}
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="mc-ssl"
              type="checkbox"
              checked={form.ssl}
              onChange={(e) => { setForm({ ...form, ssl: e.currentTarget.checked }) }}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <Label htmlFor="mc-ssl">SSL</Label>
          </div>
          {error !== null && <p className="text-sm text-red-600">{error}</p>}
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
