import { describe, it, expect } from 'vitest'
import { Ok, Err, type Result, isOk, isErr, mapOk, mapErr, unwrapOr } from './result'

describe('Result', () => {
  it('Ok wraps value', () => {
    const r = Ok(42)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(42)
  })

  it('Err wraps error', () => {
    const r = Err({ kind: 'oops' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toEqual({ kind: 'oops' })
  })

  it('isOk / isErr narrow', () => {
    const r: Result<number, { kind: 'x' }> = Ok(1)
    expect(isOk(r)).toBe(true)
    expect(isErr(r)).toBe(false)
  })

  it('mapOk transforms value, leaves Err alone', () => {
    expect(mapOk(Ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 })
    expect(mapOk(Err({ kind: 'x' }), (n: number) => n * 3)).toEqual({ ok: false, error: { kind: 'x' } })
  })

  it('mapErr transforms error, leaves Ok alone', () => {
    expect(mapErr(Err({ kind: 'a' }), (e) => ({ kind: 'b' as const, original: e }))).toEqual({
      ok: false, error: { kind: 'b', original: { kind: 'a' } },
    })
    expect(mapErr(Ok(1), (e: { kind: 'x' }) => e)).toEqual({ ok: true, value: 1 })
  })

  it('unwrapOr returns value on Ok, default on Err', () => {
    expect(unwrapOr(Ok(7), 0)).toBe(7)
    expect(unwrapOr(Err({ kind: 'x' }), 99)).toBe(99)
  })
})
