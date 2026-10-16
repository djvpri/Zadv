import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { generateSatuArtikel, todayWib } from '@/lib/artikel'

// POST /api/artikel/pre-generate — generate artikel untuk N hari ke depan
// Body: { days?: number } (default 3)
// Flow: per app × per hari → status='scheduled', scheduledFor=targetDate
// Cron harian akan publishScheduled() → push ke zomet-main + set published
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const days = Math.min(Math.max(Number(body.days) || 3, 1), 7)

  // Baca pengaturan
  const settingRows = await prisma.pengaturan.findMany({ where: { kunci: { startsWith: 'artikel_' } } })
  const settings: Record<string, string> = {}
  for (const r of settingRows) settings[r.kunci] = r.nilai

  // Hanya app yang punya web
  const allApps = await prisma.promoApp.findMany({
    where: { aktif: true, artikelAktif: true, url: { not: null } },
    orderBy: { urutan: 'asc' },
  })
  const apps = allApps.filter(a => a.url && a.url.trim().length > 0)

  if (apps.length === 0) {
    return NextResponse.json({ ok: 0, fail: 0, errors: [], skip: 'tidak ada app dengan web' })
  }

  let ok = 0
  let fail = 0
  const errors: string[] = []
  const results: { app: string; date: string; judul?: string; status: string }[] = []

  for (let d = 1; d <= days; d++) {
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + d)
    targetDate.setHours(0, 0, 0, 0)
    const yyyymmdd = `${targetDate.getFullYear()}${String(targetDate.getMonth() + 1).padStart(2, '0')}${String(targetDate.getDate()).padStart(2, '0')}`

    for (const app of apps) {
      // Skip kalau sudah ada scheduled untuk app+date ini
      const existing = await prisma.artikelDraft.findFirst({
        where: {
          appId: app.id,
          scheduledFor: targetDate,
          status: 'scheduled',
        },
        select: { id: true },
      })
      if (existing) {
        results.push({ app: app.nama, date: yyyymmdd, status: 'skip' })
        continue
      }

      try {
        const r = await generateSatuArtikel(app, yyyymmdd, { scheduledFor: targetDate })
        if (r.ok) {
          ok++
          results.push({ app: app.nama, date: yyyymmdd, judul: r.judul, status: 'ok' })
        } else {
          fail++
          errors.push(`${app.nama} (${yyyymmdd}): ${r.error}`)
          results.push({ app: app.nama, date: yyyymmdd, status: 'fail' })
        }
      } catch (e) {
        fail++
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`${app.nama} (${yyyymmdd}): ${msg}`)
        results.push({ app: app.nama, date: yyyymmdd, status: 'fail' })
      }

      // Jeda 3s antar generate untuk hindari rate limit Gemini
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  return NextResponse.json({ ok, fail, errors, results })
}
