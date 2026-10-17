import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET /api/artikel/publik — list artikel published
// Query: appId, limit (default 10, max 50)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const appId = searchParams.get('appId')
  const limit = Math.min(Number(searchParams.get('limit') || 10), 50)

  const where: Record<string, unknown> = { status: 'published' }
  if (appId) where.appId = Number(appId)

  const items = await prisma.artikelDraft.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: {
      id: true, appId: true, judul: true, slug: true,
      deskripsi: true, tags: true, publishedAt: true, gambarPath: true,
    },
  })

  return NextResponse.json({ items })
}
