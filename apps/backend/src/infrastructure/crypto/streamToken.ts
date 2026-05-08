import { createHmac, timingSafeEqual } from 'node:crypto'

const TTL_MS = 2 * 60 * 60 * 1000

type TokenPayload = Readonly<{ sessionId: string; visitorId: string }>

function payloadHash(p: TokenPayload, iat: number): string {
  return `${p.sessionId}|${p.visitorId}|${iat}`
}

export function signStreamToken(p: TokenPayload, secret: string): string {
  const iat = Date.now()
  const sig = createHmac('sha256', secret).update(payloadHash(p, iat)).digest('hex')
  return `${iat}.${sig}`
}

export function verifyStreamToken(
  token: string,
  expected: TokenPayload,
  secret: string,
): { ok: true } | { ok: false; error: 'malformed' | 'expired' | 'invalid_signature' } {
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, error: 'malformed' }
  const [iatStr, sig] = parts as [string, string]
  const iat = Number(iatStr)
  if (!Number.isInteger(iat)) return { ok: false, error: 'malformed' }
  if (Date.now() - iat > TTL_MS) return { ok: false, error: 'expired' }
  const expected_sig = createHmac('sha256', secret).update(payloadHash(expected, iat)).digest('hex')
  if (sig.length !== expected_sig.length) return { ok: false, error: 'invalid_signature' }
  if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected_sig, 'hex'))) {
    return { ok: false, error: 'invalid_signature' }
  }
  return { ok: true }
}
