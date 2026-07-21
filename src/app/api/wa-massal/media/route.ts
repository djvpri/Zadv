import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { pastikanWaMediaDir, MAX_WA_MEDIA_BYTES, TIPE_DIIZINKAN } from '@/lib/wa-media-storage'

export const runtime = 'nodejs'

function getPublicUrl(req: NextRequest, filename: string): string {
  const forced = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL
  if (forced) return `${forced.replace(/\/+$/, '')}/api/wa-massal/media/${filename}`
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000'
  return `${proto}://${host}/api/wa-massal/media/${filename}`
}

export async function POST(req: NextRequest) {
  try {
    const mime = req.headers.get('x-media-type') || req.headers.get('content-type') || ''
    const baseType = mime.split(';')[0].trim()
    const ext = TIPE_DIIZINKAN[baseType]
    if (!ext) {
      return NextResponse.json({ error: `Tipe tidak didukung: ${baseType}` }, { status: 400 })
    }

    const buffer = Buffer.from(await req.arrayBuffer())
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'File kosong' }, { status: 400 })
    }
    if (buffer.length > MAX_WA_MEDIA_BYTES) {
      return NextResponse.json({ error: `File terlalu besar (maks 16MB)` }, { status: 400 })
    }

    const originalName = req.headers.get('x-file-name') || `file.${ext}`
    const uuid = randomUUID()
    const filename = `${uuid}.${ext}`

    const dir = await pastikanWaMediaDir()
    const filepath = path.join(dir, filename)
    await fs.writeFile(filepath, buffer)

    const url = getPublicUrl(req, filename)
    return NextResponse.json({ url, filename, originalName, mime: baseType, size: buffer.length }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Upload error: ${msg}` }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { filename } = await req.json()
  if (!filename || filename.includes('/') || filename.includes('..')) {
    return NextResponse.json({ error: 'Filename tidak valid' }, { status: 400 })
  }
  const dir = await pastikanWaMediaDir()
  await fs.unlink(path.join(dir, filename)).catch(() => {})
  return NextResponse.json({ ok: true })
}
