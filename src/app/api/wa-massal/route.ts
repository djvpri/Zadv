import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { token, target, message } = await req.json()

  if (!token || !target || !message) {
    return NextResponse.json({ error: 'token, target, dan message wajib diisi' }, { status: 400 })
  }

  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target, message, countryCode: '62' }),
    })

    const data = await res.json()

    if (!res.ok || data.status === false) {
      return NextResponse.json({ ok: false, reason: data.reason || data.message || 'Gagal kirim' }, { status: 200 })
    }

    return NextResponse.json({ ok: true, detail: data })
  } catch {
    return NextResponse.json({ ok: false, reason: 'Tidak dapat terhubung ke Fonnte' }, { status: 200 })
  }
}
