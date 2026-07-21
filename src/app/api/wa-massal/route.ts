import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  return NextResponse.json({ hasEnvToken: !!process.env.FONNTE_TOKEN })
}

export async function POST(req: NextRequest) {
  const { token: bodyToken, target, message, url: mediaUrl, filename, cooldownHari } = await req.json()
  const token = bodyToken?.trim() || process.env.FONNTE_TOKEN

  if (!token || !target || !message) {
    return NextResponse.json({ error: 'token, target, dan message wajib diisi' }, { status: 400 })
  }

  // Ide 4: cek blacklist
  const isBlacklisted = await prisma.waBlacklist.findUnique({ where: { nomor: target } }).catch(() => null)
  if (isBlacklisted) return NextResponse.json({ ok: false, skip: true, reason: 'Nomor di blacklist' })

  // Ide 1: cek cooldown
  if (cooldownHari > 0) {
    const cutoff = new Date(Date.now() - cooldownHari * 24 * 60 * 60 * 1000)
    const recent = await prisma.waRiwayat.findFirst({
      where: { nomor: target, status: 'terkirim', sentAt: { gte: cutoff } },
      orderBy: { sentAt: 'desc' },
    }).catch(() => null)
    if (recent) {
      const hariLalu = Math.floor((Date.now() - recent.sentAt.getTime()) / 86400000)
      return NextResponse.json({ ok: false, skip: true, reason: `Dikirimi ${hariLalu} hari lalu` })
    }
  }

  let ok = false
  let reason: string | undefined

  try {
    const form = new FormData()
    form.append('target', target)
    form.append('message', message)
    form.append('countryCode', '62')
    if (mediaUrl) {
      form.append('url', mediaUrl)
      if (filename) form.append('filename', filename)
    }

    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': token },
      body: form,
    })

    const data = await res.json()
    ok = res.ok && data.status !== false
    reason = ok ? undefined : (data.reason || data.message || 'Gagal kirim')
    console.log('[wa-massal] Fonnte response:', JSON.stringify(data), '| url:', mediaUrl)
  } catch {
    reason = 'Tidak dapat terhubung ke Fonnte'
  }

  // Simpan ke riwayat (fire and forget)
  prisma.waRiwayat.create({
    data: { nomor: target, pesan: message, mediaUrl: mediaUrl || null, status: ok ? 'terkirim' : 'gagal', alasan: reason || null },
  }).catch(() => {})

  return NextResponse.json(ok ? { ok: true } : { ok: false, reason })
}
