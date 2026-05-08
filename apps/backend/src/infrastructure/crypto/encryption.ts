import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

function keyBuf(hex: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('encryption key must be 64 hex chars')
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string, keyHex: string): string {
  const key = keyBuf(keyHex)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${tag.toString('hex')}.${ct.toString('hex')}`
}

export function decrypt(envelope: string, keyHex: string): string {
  const parts = envelope.split('.')
  if (parts.length !== 3) throw new Error('invalid ciphertext envelope')
  const [ivHex, tagHex, ctHex] = parts as [string, string, string]
  const key = keyBuf(keyHex)
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const out = Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()])
  return out.toString('utf8')
}
