import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { devError, devWarn } from '@/lib/utils/devLog'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function vaultKeyRequiresEnv(): boolean {
  if (process.env.NODE_ENV === 'production') return true
  const ve = process.env.VERCEL_ENV
  if (ve === 'preview' || ve === 'production') return true
  return false
}

function vaultKey(): Buffer {
  const b64 = process.env.GOOGLE_REFRESH_TOKEN_ENCRYPTION_KEY?.trim()
  if (b64) {
    const buf = Buffer.from(b64, 'base64')
    if (buf.length !== 32) {
      throw new Error('GOOGLE_REFRESH_TOKEN_ENCRYPTION_KEY must be 32 bytes when base64-decoded')
    }
    return buf
  }
  if (vaultKeyRequiresEnv()) {
    throw new Error(
      'GOOGLE_REFRESH_TOKEN_ENCRYPTION_KEY is required in production, on Vercel preview/production, or when NODE_ENV=production',
    )
  }
  devWarn(
    '[googleRefreshVault] GOOGLE_REFRESH_TOKEN_ENCRYPTION_KEY not set — using insecure dev-only key',
  )
  return scryptSync('clarity-stock-dev-google-vault', 'v1', 32)
}

/** Returns null if decryption fails (wrong key, corrupt ciphertext, or missing env). */
export function decryptGoogleRefreshTokenFromStorage(ciphertext: string): string | null {
  try {
    const key = vaultKey()
    const buf = Buffer.from(ciphertext, 'base64')
    const iv = buf.subarray(0, IV_LEN)
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const enc = buf.subarray(IV_LEN + TAG_LEN)
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch (e) {
    devError('[googleRefreshVault] decrypt failed', e)
    return null
  }
}

/** Returns null if encryption is not configured (production without key). */
export function encryptGoogleRefreshTokenForStorage(plain: string): string | null {
  try {
    const key = vaultKey()
    const iv = randomBytes(IV_LEN)
    const cipher = createCipheriv(ALGO, key, iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, enc]).toString('base64')
  } catch (e) {
    devError('[googleRefreshVault] encrypt failed', e)
    return null
  }
}
