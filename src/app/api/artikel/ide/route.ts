import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET /api/artikel/ide — list ide (default: pending only)
// Query: status=pending|used|all, appId=<n>
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'
  const appId = searchParams.get('appId')

  const where: Record<string, unknown> = {}
  if (status !== 'all') where.status = status
  if (appId) where.appId = Number(appId)

  const items = await prisma.artikelIde.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: { app: { select: { nama: true, emoji: true } } },
  })

  return NextResponse.json({
    items: items.map(i => ({
      id: i.id,
      appId: i.appId,
      appName: i.app?.nama || null,
      appEmoji: i.app?.emoji || '🌐',
      teks: i.teks,
      status: i.status,
      artikelId: i.artikelId,
      usedAt: i.usedAt,
      createdAt: i.createdAt,
    })),
  })
}

// POST /api/artikel/ide — tambah ide
// Body: { teks: string, appId?: number|null }
export async function POST(req: Request) {
  const body = await req.json()
  if (!body.teks || typeof body.teks !== 'string') {
    return NextResponse.json({ error: 'teks wajib' }, { status: 400 })
  }

  const ide = await prisma.artikelIde.create({
    data: {
      teks: body.teks.trim(),
      appId: body.appId ?? null,
      status: 'pending',
    },
  })

  return NextResponse.json({ ok: true, id: ide.id })
}

// DELETE /api/artikel/ide?id=<n> — hapus ide
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get('id'))
  if (!id) return NextResponse.json({ error: 'id wajib' }, { status: 400 })

  await prisma.artikelIde.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
