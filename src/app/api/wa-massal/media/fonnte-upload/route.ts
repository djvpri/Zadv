import https from 'https'
import { NextRequest, NextResponse } from 'next/server'
import { MAX_WA_MEDIA_BYTES, TIPE_DIIZINKAN } from '@/lib/wa-media-storage'

export const runtime = 'nodejs'

// Upload ke catbox.moe — gratis, no API key, stabil dari server
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

export async function POST(req: NextRequest) {
  try {
    const mime = req.headers.get('x-media-type') || ''
    const baseType = mime.split(';')[0].trim()
    const ext = TIPE_DIIZINKAN[baseType]
    if (!ext) return NextResponse.json({ error: `Tipe tidak didukung: ${baseType}` }, { status: 400 })

    const buffer = Buffer.from(await req.arrayBuffer())
    if (buffer.length === 0) return NextResponse.json({ error: 'File kosong' }, { status: 400 })
    if (buffer.length > MAX_WA_MEDIA_BYTES)
      return NextResponse.json({ error: 'File terlalu besar (maks 16MB)' }, { status: 400 })

    const originalName = req.headers.get('x-file-name') || `file.${ext}`
    const url = await uploadKeCatbox(buffer, baseType, originalName)

    console.log('[catbox-upload] url:', url)
    return NextResponse.json({ url, filename: originalName, mime: baseType })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Upload gagal: ${msg}` }, { status: 500 })
  }
}
