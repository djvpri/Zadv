import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { getJwtSecret } from './secrets'

const COOKIE_NAME = 'zadv_session'
const MAX_AGE_DETIK = 60 * 60 * 24 * 30 // 30 hari, samakan dengan konvensi ekosistem

function secretBytes() {
  return new TextEncoder().encode(getJwtSecret())
}

export async function buatSessionToken(): Promise<string> {
  return await new SignJWT({ auth: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_DETIK}s`)
    .sign(secretBytes())
}

export async function setSessionCookie(token: string) {
  const store = await cookies()
  // Electron pakai HTTP di localhost — Secure flag harus false agar cookie terkirim
  const isElectron = process.env.ELECTRON_APP === 'true'
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: !isElectron && process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_DETIK,
    path: '/',
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

// Dipakai di middleware & API routes — verifikasi murni kriptografi
// (tanpa DB call), jadi tidak bergantung koneksi apa pun selain baca cookie.
export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secretBytes())
    return true
  } catch {
    return false
  }
}

export { COOKIE_NAME }
