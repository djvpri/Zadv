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
  if (!req.body) return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 })

  const mime = req.headers.get('x-media-type') || req.headers.get('content-type') || ''
  const baseType = mime.split(';')[0].trim()
  const ext = TIPE_DIIZINKAN[baseType]
  if (!ext) {
    return NextResponse.json({ error: `Tipe tidak didukung: ${baseType}` }, { status: 400 })
  }

  const originalName = req.headers.get('x-file-name') || `file.${ext}`
  const uuid = randomUUID()
  const filename = `${uuid}.${ext}`

  const dir = await pastikanWaMediaDir()
  const filepath = path.join(dir, filename)

  const { createWriteStream } = await import('fs')
  const { Readable } = await import('stream')
  const { pipeline } = await import('stream/promises')

  const ws = createWriteStream(filepath)
  const nodeStream = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0])
  await pipeline(nodeStream, ws)

  const stat = await fs.stat(filepath)
  if (stat.size === 0) {
    await fs.unlink(filepath).catch(() => {})
    return NextResponse.json({ error: 'File kosong' }, { status: 400 })
  }
  if (stat.size > MAX_WA_MEDIA_BYTES) {
    await fs.unlink(filepath).catch(() => {})
    return NextResponse.json({ error: `File terlalu besar (maks 16MB)` }, { status: 400 })
  }

  const url = getPublicUrl(req, filename)
  return NextResponse.json({ url, filename, originalName, mime: baseType, size: stat.size }, { status: 201 })
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
