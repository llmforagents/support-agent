import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/infrastructure/apiClient'
import { cn } from '@/lib/cn'

export function OnlineToggle(): React.JSX.Element {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState<{ activeCount: number } | null>(null)

  const cfgQ = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => apiClient.configGet(),
    refetchInterval: 30_000,
  })

  const sessionsQ = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiClient.sessionsList(),
    refetchInterval: 30_000,
  })

  const setOnline = useMutation({
    mutationFn: (online: boolean) => apiClient.adminSetOnline(online),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-config'] })
      setConfirming(null)
    },
  })

  const isOnline = Boolean(cfgQ.data?.['adminOnline'])
  const activeOperatorCount = (sessionsQ.data?.sessions ?? []).filter(
    (s) => s.state.status === 'active_operator',
  ).length

  const handleClick = (): void => {
    if (isOnline && activeOperatorCount > 0) {
      setConfirming({ activeCount: activeOperatorCount })
      return
    }
    setOnline.mutate(!isOnline)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={setOnline.isPending}
        title={isOnline ? 'Online — click para desconectarse' : 'Offline — click para conectarse'}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-colors',
          isOnline
            ? 'bg-green-500 text-white hover:bg-green-600'
            : 'bg-zinc-300 text-zinc-700 hover:bg-zinc-400',
          setOnline.isPending && 'opacity-50',
        )}
      >
        {isOnline ? 'ON' : 'OFF'}
      </button>

      {confirming !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold">¿Pasar a offline?</h3>
            <p className="mb-4 text-sm text-zinc-600">
              Tenés{' '}
              <strong>{confirming.activeCount}</strong>{' '}
              sesión{confirming.activeCount === 1 ? '' : 'es'} activa
              {confirming.activeCount === 1 ? '' : 's'} con vos.
              Al pasar a offline, los visitantes pasarán al AI.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setConfirming(null) }}
                className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { setOnline.mutate(false) }}
                className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
