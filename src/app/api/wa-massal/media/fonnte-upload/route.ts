import { NextRequest, NextResponse } from 'next/server'
import { MAX_WA_MEDIA_BYTES, TIPE_DIIZINKAN } from '@/lib/wa-media-storage'

export const runtime = 'nodejs'

// Upload ke Telegraph (telegra.ph) — gratis, tanpa API key, URL permanen
async function uploadKeTelegraph(buffer: Buffer, mime: string, filename: string): Promise<string> {
  const form = new FormData()
  const blob = new Blob([buffer], { type: mime })
  form.append('file', blob, filename)

  const res = await fetch('https://telegra.ph/upload', {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(`Telegraph HTTP ${res.status}`)
  const data = await res.json()
  // Response: [{ "src": "/file/xxx.jpg" }]
  if (!Array.isArray(data) || !data[0]?.src) throw new Error('Response Telegraph tidak valid')
  return `https://telegra.ph${data[0].src}`
}

export async function POST(req: NextRequest) {
  try {
    const mime = req.headers.get('x-media-type') || ''
    const baseType = mime.split(';')[0].trim()
    const ext = TIPE_DIIZINKAN[baseType]
    if (!ext) return NextResponse.json({ error: `Tipe tidak didukung: ${baseType}` }, { status: 400 })

    // Telegraph hanya support gambar
    if (!baseType.startsWith('image/')) {
      return NextResponse.json({ error: 'Telegraph hanya support gambar. Untuk PDF/video gunakan mode URL eksternal.' }, { status: 400 })
    }

    const buffer = Buffer.from(await req.arrayBuffer())
    if (buffer.length === 0) return NextResponse.json({ error: 'File kosong' }, { status: 400 })
    if (buffer.length > MAX_WA_MEDIA_BYTES) return NextResponse.json({ error: 'File terlalu besar (maks 16MB)' }, { status: 400 })

    const originalName = req.headers.get('x-file-name') || `file.${ext}`
    const url = await uploadKeTelegraph(buffer, baseType, originalName)

    console.log('[telegraph-upload] url:', url)
    return NextResponse.json({ url, filename: originalName, mime: baseType })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Upload gagal: ${msg}` }, { status: 500 })
  }
}
