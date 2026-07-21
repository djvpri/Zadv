import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// Proxy URL gambar ke Telegraph agar Fonnte bisa download tanpa hotlink block
async function proxyKeTelegraph(sourceUrl: string): Promise<string> {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Download gagal (${res.status})`)
  const mime = res.headers.get('content-type')?.split(';')[0].trim() || 'image/jpeg'
  if (!mime.startsWith('image/')) return sourceUrl // PDF/video: kirim apa adanya
  const buffer = Buffer.from(await res.arrayBuffer())
  const ext = mime.split('/')[1] || 'jpg'

  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mime }), `proxy.${ext}`)
  const tRes = await fetch('https://telegra.ph/upload', { method: 'POST', body: form })
  if (!tRes.ok) throw new Error(`Telegraph HTTP ${tRes.status}`)
  const data = await tRes.json()
  if (!Array.isArray(data) || !data[0]?.src) throw new Error('Response Telegraph tidak valid')
  return `https://telegra.ph${data[0].src}`
}

export async function GET() {
  return NextResponse.json({ hasEnvToken: !!process.env.FONNTE_TOKEN })
}

export async function POST(req: NextRequest) {
  const { token: bodyToken, target, message, url: mediaUrl, filename } = await req.json()
  const token = bodyToken?.trim() || process.env.FONNTE_TOKEN

  if (!token || !target || !message) {
    return NextResponse.json({ error: 'token, target, dan message wajib diisi' }, { status: 400 })
  }

  let ok = false
  let reason: string | undefined
  let finalUrl: string | undefined = mediaUrl || undefined

  // Proxy URL non-Telegraph ke Telegraph agar Fonnte bisa akses gambar
  if (finalUrl && !finalUrl.includes('telegra.ph')) {
    try {
      finalUrl = await proxyKeTelegraph(finalUrl)
      console.log('[wa-massal] proxied to telegraph:', finalUrl)
    } catch (e) {
      console.warn('[wa-massal] proxy gagal, kirim url asli:', e instanceof Error ? e.message : e)
    }
  }

  try {
    const form = new FormData()
    form.append('target', target)
    form.append('message', message)
    form.append('countryCode', '62')
    if (finalUrl) {
      form.append('url', finalUrl)
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
    console.log('[wa-massal] Fonnte response:', JSON.stringify(data), '| url:', finalUrl)
  } catch {
    reason = 'Tidak dapat terhubung ke Fonnte'
  }

  // Simpan ke riwayat (fire and forget)
  prisma.waRiwayat.create({
    data: { nomor: target, pesan: message, mediaUrl: finalUrl || null, status: ok ? 'terkirim' : 'gagal', alasan: reason || null },
  }).catch(() => {})

  return NextResponse.json(ok ? { ok: true } : { ok: false, reason })
}
