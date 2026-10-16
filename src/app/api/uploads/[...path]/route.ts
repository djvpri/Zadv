import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

// GET /api/uploads/[...path] — serve file statis dari public/uploads/
// Next.js standalone tidak serve /public/ secara default.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const filePath = join(process.cwd(), 'public', 'uploads', ...path)

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const buffer = await readFile(filePath)
  const ext = path[path.length - 1]?.split('.').pop()?.toLowerCase() || ''
  const mime: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4',
  }

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
