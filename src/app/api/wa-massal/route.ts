import https from 'https'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// Upload buffer ke catbox.moe via https module (reliable dari server)
async function uploadKeCatbox(buffer: Buffer, mime: string, filename: string): Promise<string> {
  const boundary = 'CbxBound9f3k'
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileToUpload"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'catbox.moe',
        path: '/user/api.php',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          'User-Agent': 'Mozilla/5.0 (compatible)',
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => {
          const url = raw.trim()
          if (res.statusCode && res.statusCode >= 300) {
            reject(new Error(`Catbox HTTP ${res.statusCode}: ${url.slice(0, 80)}`))
          } else if (!url.startsWith('https://')) {
            reject(new Error(`Catbox error: ${url.slice(0, 80)}`))
          } else {
            resolve(url)
          }
        })
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

// Proxy URL gambar ke catbox.moe agar Fonnte bisa download
async function proxyKeCatbox(sourceUrl: string): Promise<string> {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Download gagal (${res.status})`)
  const mime = res.headers.get('content-type')?.split(';')[0].trim() || 'image/jpeg'
  if (!mime.startsWith('image/')) return sourceUrl // PDF/video: kirim apa adanya
  const buffer = Buffer.from(await res.arrayBuffer())
  const ext = mime.split('/')[1] || 'jpg'
  return uploadKeCatbox(buffer, mime, `proxy.${ext}`)
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

  // Proxy URL non-catbox ke catbox agar Fonnte bisa akses gambar
  if (finalUrl && !finalUrl.includes('files.catbox.moe')) {
    try {
      finalUrl = await proxyKeCatbox(finalUrl)
      console.log('[wa-massal] proxied to catbox:', finalUrl)
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
