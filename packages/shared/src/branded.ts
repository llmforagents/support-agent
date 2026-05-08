type Brand<T, B extends string> = T & { readonly __brand: B }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function makeUuidBrand<B extends string>(label: B) {
  return (raw: string): Brand<string, B> => {
    if (!UUID_RE.test(raw)) throw new Error(`Invalid ${label}: ${raw}`)
    return raw as Brand<string, B>
  }
}

export type SessionId = Brand<string, 'SessionId'>
export const SessionId = makeUuidBrand('SessionId')

export type AdminId = Brand<string, 'AdminId'>
export const AdminId = makeUuidBrand('AdminId')

export type MessageId = Brand<string, 'MessageId'>
export const MessageId = makeUuidBrand('MessageId')

export type SourceId = Brand<string, 'SourceId'>
export const SourceId = makeUuidBrand('SourceId')

export type ChunkId = Brand<string, 'ChunkId'>
export const ChunkId = makeUuidBrand('ChunkId')

export type VisitorId = Brand<string, 'VisitorId'>
export const VisitorId = makeUuidBrand('VisitorId')

export type ApiKey = Brand<string, 'ApiKey'>
export const ApiKey = (raw: string): ApiKey => {
  if (!raw.startsWith('sk-proxy-') || raw.length < 20) {
    throw new Error(`Invalid ApiKey`)
  }
  return raw as ApiKey
}

export type UsdCents = Brand<number, 'UsdCents'>
export const UsdCents = (raw: number): UsdCents => {
  if (!Number.isInteger(raw) || raw < 0) {
    throw new Error(`Invalid UsdCents: ${raw}`)
  }
  return raw as UsdCents
}
