import { NextResponse } from 'next/server'
import { getAdminPassword } from '@/lib/secrets'
import { buatSessionToken, setSessionCookie } from '@/lib/auth'

export async function POST(req: Request) {
  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: 'Password wajib diisi' }, { status: 400 })

  let adminPassword: string
  try {
    adminPassword = getAdminPassword()
  } catch {
    return NextResponse.json({ error: 'Login belum dikonfigurasi (ADMIN_PASSWORD)' }, { status: 503 })
  }

  if (password !== adminPassword) {
    return NextResponse.json({ error: 'Password salah' }, { status: 401 })
  }

  const token = await buatSessionToken()
  await setSessionCookie(token)
  return NextResponse.json({ ok: true })
}
