import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  try {
    const apps = await prisma.promoApp.findMany({
      where: { aktif: true },
      orderBy: { urutan: 'asc' },
    })
    return NextResponse.json(apps)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  if (!body.nama || !body.tagline) {
    return NextResponse.json({ error: 'nama dan tagline wajib diisi' }, { status: 400 })
  }
  const app = await prisma.promoApp.create({
    data: {
      nama: body.nama,
      emoji: body.emoji || '📦',
      tagline: body.tagline,
      fitur: Array.isArray(body.fitur) ? body.fitur : [],
      accent: body.accent || '#2563EB',
      tint: body.tint || '#EBF1FF',
      url: body.url || null,
      urutan: body.urutan ?? 0,
    },
  })
  return NextResponse.json(app, { status: 201 })
}
