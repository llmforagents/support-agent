// AES-256-GCM envelope cipher. Built on the Web Crypto API
// (`globalThis.crypto.subtle`) so the same module runs unmodified on Node 20+
// and Cloudflare Workers. The original Node `createCipheriv` path required
// workerd 1.20250x or newer; the test pool (vitest-pool-workers 0.5.41 with
// workerd 1.20241230) doesn't expose it. Web Crypto's `aes-gcm` returns the
// ciphertext concatenated with a 16-byte tag, so we split on the boundary to
// preserve the existing on-disk envelope format `iv.tag.ct` (all hex).
//
// API is async (Web Crypto exposes only Promises). The Container's
// `encrypt`/`decrypt` types are `(s: string) => Promise<string>` and every
// caller awaits; the change is purely surface-level (same envelope bytes go
// out, so existing encrypted rows continue to round-trip).
const IV_BYTES = 12
const TAG_BYTES = 16

function keyBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('encryption key must be 64 hex chars')
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    const slice = hex.slice(i * 2, i * 2 + 2)
    out[i] = parseInt(slice, 16)
  }
  return out
}

function toHex(buf: Uint8Array): string {
  let s = ''
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] ?? 0
    s += byte.toString(16).padStart(2, '0')
  }
  return s
}

function fromHex(hex: string): Uint8Array {
  const len = hex.length / 2
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

async function importKey(keyHex: string): Promise<CryptoKey> {
  // BufferSource (ArrayBuffer) is required by SubtleCrypto in workerd; a raw
  // typed-array view's backing buffer might be shared, so copy into an
  // ArrayBuffer slice scoped to the key bytes.
  const bytes = keyBytes(keyHex)
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return crypto.subtle.importKey('raw', buf, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ctWithTag = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext),
    ),
  )
  // Web Crypto returns ciphertext || tag (16 bytes). Split for envelope parity
  // with the legacy `iv.tag.ct` shape so on-disk rows stay backward-compatible.
  const tagStart = ctWithTag.length - TAG_BYTES
  const ct = ctWithTag.subarray(0, tagStart)
  const tag = ctWithTag.subarray(tagStart)
  return `${toHex(iv)}.${toHex(tag)}.${toHex(ct)}`
}

export async function decrypt(envelope: string, keyHex: string): Promise<string> {
  const parts = envelope.split('.')
  if (parts.length !== 3) throw new Error('invalid ciphertext envelope')
  const [ivHex, tagHex, ctHex] = parts as [string, string, string]
  const key = await importKey(keyHex)
  const iv = fromHex(ivHex)
  const tag = fromHex(tagHex)
  const ct = fromHex(ctHex)
  // Web Crypto expects ciphertext || tag as a single buffer.
  const ctWithTag = new Uint8Array(ct.length + tag.length)
  ctWithTag.set(ct, 0)
  ctWithTag.set(tag, ct.length)
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ctWithTag as BufferSource,
  )
  return new TextDecoder().decode(plainBuf)
}
