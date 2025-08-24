import { env } from '@acme/core'
import crypto from 'node:crypto'

function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'base64')
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return plaintext.toString('utf8')
}

// Helpers to store ciphertext in Prisma Bytes columns
export function encryptToBytes(plaintext: string): Buffer {
  const b64 = encrypt(plaintext)
  return Buffer.from(b64, 'base64')
}

export function decryptFromBytes(bytes: Buffer | Uint8Array | null | undefined): string | null {
  if (!bytes) return null
  const buf = Buffer.from(bytes)
  const b64 = buf.toString('base64')
  return decrypt(b64)
}

