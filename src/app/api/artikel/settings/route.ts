import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET /api/artikel/settings — baca pengaturan artikel otomatis
export async function GET() {
  const rows = await prisma.pengaturan.findMany({
    where: { kunci: { startsWith: 'artikel_' } },
  })
  const settings: Record<string, string> = {}
  for (const r of rows) settings[r.kunci] = r.nilai

  // Default: autopost ON, jam 07:00 WIB (00:00 UTC), tujuan zomet ON, tujuan app ON
  const autopost = settings.artikel_autopost !== 'false'
  const jam = settings.artikel_jam || '07:00'
  const tujuanZomet = settings.artikel_tujuan_zomet !== 'false'
  const tujuanApp = settings.artikel_tujuan_app !== 'false'

  // Status per app
  const apps = await prisma.promoApp.findMany({
    where: { aktif: true },
    orderBy: { urutan: 'asc' },
    select: { id: true, nama: true, emoji: true, url: true, artikelAktif: true },
  })

  // Stats bulan ini
  const now = new Date()
  const awalBulan = new Date(now.getFullYear(), now.getMonth(), 1)
  const publishedCount = await prisma.artikelDraft.count({
    where: { status: 'published', publishedAt: { gte: awalBulan } },
  })
  const draftCount = await prisma.artikelDraft.count({
    where: { status: 'draft' },
  })
  const scheduledCount = await prisma.artikelDraft.count({
    where: { status: 'scheduled' },
  })
  const failedCount = await prisma.artikelDraft.count({
    where: { status: 'failed' },
  })

  return NextResponse.json({
    autopost,
    jam,
    tujuanZomet,
    tujuanApp,
    apps: apps.map(a => ({
      id: a.id,
      nama: a.nama,
      emoji: a.emoji,
      url: a.url,
      artikelAktif: a.artikelAktif,
      punyaWeb: !!a.url,
    })),
    stats: { publishedCount, draftCount, scheduledCount, failedCount },
  })
}

// PUT /api/artikel/settings — update pengaturan
export async function PUT(req: Request) {
  const body = await req.json()
  const updates: Record<string, string> = {}

  if (typeof body.autopost === 'boolean') updates.artikel_autopost = String(body.autopost)
  if (typeof body.jam === 'string') updates.artikel_jam = body.jam
  if (typeof body.tujuanZomet === 'boolean') updates.artikel_tujuan_zomet = String(body.tujuanZomet)
  if (typeof body.tujuanApp === 'boolean') updates.artikel_tujuan_app = String(body.tujuanApp)

  for (const [kunci, nilai] of Object.entries(updates)) {
    await prisma.pengaturan.upsert({
      where: { kunci },
      create: { kunci, nilai },
      update: { nilai },
    })
  }

  // Update artikelAktif per app
  if (Array.isArray(body.appSettings)) {
    for (const aps of body.appSettings) {
      if (typeof aps.id === 'number' && typeof aps.artikelAktif === 'boolean') {
        await prisma.promoApp.update({
          where: { id: aps.id },
          data: { artikelAktif: aps.artikelAktif },
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
