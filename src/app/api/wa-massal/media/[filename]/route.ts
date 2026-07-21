import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { getWaMediaDir, TIPE_DIIZINKAN } from '@/lib/wa-media-storage'

export const runtime = 'nodejs'

const EXT_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(TIPE_DIIZINKAN).map(([mime, ext]) => [ext, mime])
)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params

  // Cegah path traversal
  if (!filename || filename.includes('/') || filename.includes('..')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const filepath = path.join(getWaMediaDir(), filename)
  try {
    const data = await fs.readFile(filepath)
    const ext = path.extname(filename).replace('.', '')
    const mime = EXT_TO_MIME[ext] || 'application/octet-stream'
    return new NextResponse(data, {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(data.length),
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
