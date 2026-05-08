import { useState, type FormEvent, type ChangeEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/infrastructure/apiClient'
import { Button } from '@/presentation/components/ui/button'
import { Input } from '@/presentation/components/ui/input'
import { Label } from '@/presentation/components/ui/label'
import { Card } from '@/presentation/components/ui/card'
import { t } from '@/lib/i18n'

export function UploadModal({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<'pdf' | 'md' | 'txt'>('pdf')
  const [error, setError] = useState<string | null>(null)

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('no file')
      return apiClient.sourceCreate(file, name, type)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sources'] })
      onClose()
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'upload failed')
    },
  })

  const onFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.currentTarget.files?.[0] ?? null
    setFile(f)
    if (f && !name) {
      setName(f.name.replace(/\.[^.]+$/, ''))
      const ext = f.name.split('.').pop()?.toLowerCase()
      if (ext === 'pdf') setType('pdf')
      else if (ext === 'md' || ext === 'markdown') setType('md')
      else setType('txt')
    }
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    upload.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-md space-y-4 p-6">
        <h2 className="text-xl font-semibold">{t('kb.upload.title')}</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="kb-file">{t('kb.upload.file')}</Label>
            <input
              id="kb-file"
              type="file"
              accept=".pdf,.md,.markdown,.txt"
              onChange={onFileChange}
              className="mt-1 block w-full rounded border border-zinc-300 bg-white p-2 text-sm"
              required
            />
          </div>
          <div>
            <Label htmlFor="kb-name">{t('kb.upload.name')}</Label>
            <Input
              id="kb-name"
              value={name}
              onChange={(e) => { setName(e.currentTarget.value) }}
              required
            />
          </div>
          <div>
            <Label htmlFor="kb-type">{t('kb.upload.type')}</Label>
            <select
              id="kb-type"
              value={type}
              onChange={(e) => { setType(e.currentTarget.value as 'pdf' | 'md' | 'txt') }}
              className="mt-1 block w-full rounded border border-zinc-300 bg-white p-2 text-sm"
            >
              <option value="pdf">PDF</option>
              <option value="md">Markdown</option>
              <option value="txt">Plain text</option>
            </select>
          </div>
          {error !== null && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!file || !name || upload.isPending}>
              {upload.isPending ? t('kb.upload.uploading') : t('kb.upload.submit')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
