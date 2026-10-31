import {
  createHash,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

export function randomId(bytes = 9) {
  return randomBytes(bytes).toString('base64url')
}

export function randomSlug() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  return Array.from(
    { length: 11 },
    () => alphabet[randomInt(alphabet.length)],
  ).join('')
}

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`
}

export function checkPin(pin: string, stored: string) {
  const [salt, expected] = stored.split(':')
  if (!salt || !expected) return false
  const actual = scryptSync(pin, salt, 32)
  const expectedBytes = Buffer.from(expected, 'hex')
  return (
    actual.length === expectedBytes.length &&
    timingSafeEqual(actual, expectedBytes)
  )
}

export async function verifyTurnstile(token: unknown) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY
  if (!secretKey) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('TURNSTILE_SECRET_KEY is not configured')
    return true
  }
  if (typeof token !== 'string' || !token) return false
  const body = new FormData()
  body.set('secret', secretKey)
  body.set('response', token)
  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body, cache: 'no-store' },
  )
  if (!response.ok) return false
  const result = (await response.json()) as { success?: boolean }
  return result.success === true
}
