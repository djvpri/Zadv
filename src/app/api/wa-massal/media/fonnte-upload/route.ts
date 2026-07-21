import { NextRequest, NextResponse } from 'next/server'
import { MAX_WA_MEDIA_BYTES, TIPE_DIIZINKAN } from '@/lib/wa-media-storage'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('x-fonnte-token') || process.env.FONNTE_TOKEN
    if (!token) return NextResponse.json({ error: 'Token Fonnte tidak ditemukan' }, { status: 400 })

    const mime = req.headers.get('x-media-type') || ''
    const baseType = mime.split(';')[0].trim()
    const ext = TIPE_DIIZINKAN[baseType]
    if (!ext) return NextResponse.json({ error: `Tipe tidak didukung: ${baseType}` }, { status: 400 })

    const buffer = Buffer.from(await req.arrayBuffer())
    if (buffer.length === 0) return NextResponse.json({ error: 'File kosong' }, { status: 400 })
    if (buffer.length > MAX_WA_MEDIA_BYTES) return NextResponse.json({ error: 'File terlalu besar (maks 16MB)' }, { status: 400 })

    const originalName = req.headers.get('x-file-name') || `file.${ext}`

    const form = new FormData()
    const blob = new Blob([buffer], { type: baseType })
    form.append('file', blob, originalName)

    const res = await fetch('https://api.fonnte.com/upload-file', {
      method: 'POST',
      headers: { 'Authorization': token },
      body: form,
    })

    const data = await res.json()
    console.log('[fonnte-upload] response:', JSON.stringify(data))

    if (data.status === true && data.url) {
      return NextResponse.json({ url: data.url, filename: originalName, mime: baseType })
    } else {
      return NextResponse.json({ error: data.reason || data.message || 'Upload ke Fonnte gagal' }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error: ${msg}` }, { status: 500 })
  }
}
