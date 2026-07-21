import { NextRequest, NextResponse } from 'next/server'
import { MAX_WA_MEDIA_BYTES, TIPE_DIIZINKAN } from '@/lib/wa-media-storage'

export const runtime = 'nodejs'

// Buat multipart body manual — Node.js native FormData+Blob kadang 400 di Telegraph
function buatMultipart(buffer: Buffer, mime: string, filename: string) {
  const boundary = 'TelegraphBoundary7x9k2m'
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([head, buffer, tail])
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

async function uploadKeTelegraph(buffer: Buffer, mime: string, filename: string): Promise<string> {
  const { body, contentType } = buatMultipart(buffer, mime, filename)

  const res = await fetch('https://telegra.ph/upload', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Telegraph HTTP ${res.status}: ${txt.slice(0, 100)}`)
  }
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
