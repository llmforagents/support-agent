import { describe, it, expect, vi } from 'vitest'
import { InProcessSseHub } from './inProcessSseHub'
import type { BroadcastEvent } from '../../application/ports'

describe('InProcessSseHub', () => {
  it('publish reaches subscriber', () => {
    const hub = new InProcessSseHub()
    const fn = vi.fn()
    hub.subscribe('admin_inbox', fn)
    const ev: BroadcastEvent = { type: 'admin_status', online: true }
    hub.publish('admin_inbox', ev)
    expect(fn).toHaveBeenCalledWith(ev)
  })

  it('returned dispose unsubscribes', () => {
    const hub = new InProcessSseHub()
    const fn = vi.fn()
    const dispose = hub.subscribe('admin_inbox', fn)
    dispose()
    hub.publish('admin_inbox', { type: 'admin_status', online: false })
    expect(fn).not.toHaveBeenCalled()
  })

  it('isolates channels', () => {
    const hub = new InProcessSseHub()
    const a = vi.fn(); const b = vi.fn()
    hub.subscribe('admin_inbox', a)
    hub.subscribe('admin_status', b)
    hub.publish('admin_inbox', { type: 'admin_status', online: true })
    expect(a).toHaveBeenCalledOnce()
    expect(b).not.toHaveBeenCalled()
  })
})
