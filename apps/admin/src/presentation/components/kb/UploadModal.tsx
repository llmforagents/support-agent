import { useState, useEffect, useId, useRef, type FormEvent, type ChangeEvent } from 'react'
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
  const titleId = useId()
  const fileId = useId()
  const nameId = useId()
  const typeId = useId()
  const errorId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<Element | null>(null)

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

  // Focus management: capture previously focused element on mount, restore on unmount.
  useEffect(() => {
    previousFocusRef.current = document.activeElement
    // Focus the first focusable element inside the dialog
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button',
    )
    firstFocusable?.focus()
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [])

  // ESC closes the dialog
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

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
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <Card className="w-full max-w-md space-y-4 p-6">
        <h2 id={titleId} className="text-xl font-semibold text-zinc-900">
          {t('kb.upload.title')}
        </h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor={fileId}>{t('kb.upload.file')}</Label>
            <input
              id={fileId}
              type="file"
              accept=".pdf,.md,.markdown,.txt"
              onChange={onFileChange}
              className="mt-1 block w-full rounded border border-zinc-400 bg-white p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              required
            />
          </div>
          <div>
            <Label htmlFor={nameId}>{t('kb.upload.name')}</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => { setName(e.currentTarget.value) }}
              required
            />
          </div>
          <div>
            <Label htmlFor={typeId}>{t('kb.upload.type')}</Label>
            <select
              id={typeId}
              value={type}
              onChange={(e) => { setType(e.currentTarget.value as 'pdf' | 'md' | 'txt') }}
              className="mt-1 block w-full rounded border border-zinc-400 bg-white p-2 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <option value="pdf">PDF</option>
              <option value="md">Markdown</option>
              <option value="txt">Plain text</option>
            </select>
          </div>
          {error !== null && (
            <p id={errorId} role="alert" className="text-sm text-red-700">{error}</p>
          )}
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
