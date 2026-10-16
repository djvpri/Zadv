import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { generateSatuArtikel, publishScheduled, todayWib } from '@/lib/artikel'

// POST /api/artikel/trigger — cron harian: publish scheduled + generate 1 baru per app
export async function POST() {
  // Baca pengaturan dari dashboard
  const settingRows = await prisma.pengaturan.findMany({ where: { kunci: { startsWith: 'artikel_' } } })
  const settings: Record<string, string> = {}
  for (const r of settingRows) settings[r.kunci] = r.nilai

  // Cek autopost
  if (settings.artikel_autopost === 'false') {
    return NextResponse.json({ ok: 0, fail: 0, errors: [], skip: 'autopost dinonaktifkan dari dashboard' })
  }

  // Cek jam: skip jika belum waktunya (WIB)
  const jam = settings.artikel_jam || '07:00'
  const settingHour = parseInt(jam.split(':')[0])
  const nowWib = new Date(Date.now() + 7 * 3600 * 1000)
  if (nowWib.getUTCHours() < settingHour) {
    return NextResponse.json({ ok: 0, fail: 0, errors: [], skip: `belum waktunya (setting=${jam}, now WIB=${String(nowWib.getUTCHours()).padStart(2, '0')}:00)` })
  }

  const tujuanZomet = settings.artikel_tujuan_zomet !== 'false'
  const tujuanApp = settings.artikel_tujuan_app !== 'false'

  // 1. Publish artikel yang scheduled untuk hari ini
  const pubResult = await publishScheduled(tujuanZomet, tujuanApp)

  // 2. Generate 1 artikel baru per app untuk hari ini (jika belum ada)
  //    Target: today + 3 hari (slot berikutnya)
  const allApps = await prisma.promoApp.findMany({
    where: { aktif: true, artikelAktif: true, url: { not: null } },
    orderBy: { urutan: 'asc' },
  })
  const apps = allApps.filter(a => a.url && a.url.trim().length > 0)

  if (apps.length === 0) {
    return NextResponse.json({ ok: pubResult.ok, fail: pubResult.fail, errors: pubResult.errors, published: pubResult, skip: 'tidak ada app dengan web' })
  }

  const yyyymmdd = todayWib()
  let okGen = 0
  let failGen = 0
  const errorsGen: string[] = []

  // Target generate: today + 3 hari (isi slot berikutnya)
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + 3)
  targetDate.setHours(0, 0, 0, 0)
  const targetYyyymmdd = `${targetDate.getFullYear()}${String(targetDate.getMonth() + 1).padStart(2, '0')}${String(targetDate.getDate()).padStart(2, '0')}`

  for (const app of apps) {
    try {
      // Skip kalau sudah ada scheduled untuk app+targetDate
      const existing = await prisma.artikelDraft.findFirst({
        where: { appId: app.id, scheduledFor: targetDate, status: 'scheduled' },
        select: { id: true },
      })
      if (existing) { okGen++; continue }

      const r = await generateSatuArtikel(app, targetYyyymmdd, { scheduledFor: targetDate })
      if (r.ok) okGen++
      else { failGen++; errorsGen.push(`${app.nama}: ${r.error}`) }
    } catch (e) {
      failGen++
      errorsGen.push(`${app.nama}: ${e instanceof Error ? e.message : String(e)}`)
    }
    // Jeda 3s antar app
    await new Promise(r => setTimeout(r, 3000))
  }

  return NextResponse.json({
    published: pubResult,
    generated: { ok: okGen, fail: failGen, errors: errorsGen },
    ok: pubResult.ok + okGen,
    fail: pubResult.fail + failGen,
    errors: [...pubResult.errors, ...errorsGen],
  })
}
