import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET /api/artikel/riwayat — list artikel draft untuk dashboard
// Query: limit (default 20, max 100), appId
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') || 20), 100)
  const appId = searchParams.get('appId')

  const where: Record<string, unknown> = {}
  if (appId) where.appId = Number(appId)

  const items = await prisma.artikelDraft.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      app: { select: { nama: true, emoji: true } },
    },
  })

  return NextResponse.json({
    items: items.map(a => ({
      id: a.id,
      appId: a.appId,
      appName: a.app?.nama || '—',
      appEmoji: a.app?.emoji || '📦',
      judul: a.judul,
      slug: a.slug,
      status: a.status,
      publishedAt: a.publishedAt,
      scheduledFor: a.scheduledFor,
      fotoId: a.fotoId,
      createdAt: a.createdAt,
    })),
  })
}
