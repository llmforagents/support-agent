import { describe, it, expect } from 'vitest'
import { WorkersLogger } from './workersLogger'

describe('WorkersLogger', () => {
  it('emits info-level JSON when LOG_LEVEL=info; suppresses debug', () => {
    const out: string[] = []
    const origLog = console.log
    console.log = (s: string) => out.push(s)
    try {
      const l = new WorkersLogger('info')
      l.debug({ foo: 1 }, 'should not appear')
      l.info({ bar: 2 }, 'visible')
      expect(out.length).toBe(1)
      const first = out[0]
      if (first === undefined) throw new Error('expected one log line')
      const parsed = JSON.parse(first) as { level: string; msg: string; bar: number }
      expect(parsed.level).toBe('info')
      expect(parsed.msg).toBe('visible')
      expect(parsed.bar).toBe(2)
    } finally {
      console.log = origLog
    }
  })

  it('routes error level to console.error', () => {
    const out: string[] = []
    const origErr = console.error
    console.error = (s: string) => out.push(s)
    try {
      new WorkersLogger('debug').error({ err: 'boom' }, 'failed')
      expect(out.length).toBe(1)
    } finally {
      console.error = origErr
    }
  })

  it('accepts a string-only call (no obj)', () => {
    const out: string[] = []
    const origLog = console.log
    console.log = (s: string) => out.push(s)
    try {
      new WorkersLogger('info').info('hello')
      const first = out[0]
      if (first === undefined) throw new Error('expected one log line')
      const parsed = JSON.parse(first) as { msg: string }
      expect(parsed.msg).toBe('hello')
    } finally {
      console.log = origLog
    }
  })

  it('child() returns a logger that merges bindings into every payload', () => {
    const out: string[] = []
    const origLog = console.log
    console.log = (s: string) => out.push(s)
    try {
      const root = new WorkersLogger('info')
      const child = root.child({ requestId: 'abc-123' })
      child.info({ extra: 1 }, 'hi')
      const line = out[0]
      if (line === undefined) throw new Error('expected one log line')
      const parsed = JSON.parse(line) as { requestId: string; extra: number; msg: string }
      expect(parsed.requestId).toBe('abc-123')
      expect(parsed.extra).toBe(1)
      expect(parsed.msg).toBe('hi')
    } finally {
      console.log = origLog
    }
  })

  it('suppresses lower-priority levels when LOG_LEVEL=warn', () => {
    const out: string[] = []
    const origLog = console.log
    const origErr = console.error
    console.log = (s: string) => out.push(s)
    console.error = (s: string) => out.push(s)
    try {
      const l = new WorkersLogger('warn')
      l.debug({ a: 1 }, 'no')
      l.info({ a: 2 }, 'no')
      l.warn({ a: 3 }, 'yes')
      l.error({ a: 4 }, 'yes')
      expect(out.length).toBe(2)
    } finally {
      console.log = origLog
      console.error = origErr
    }
  })
})
