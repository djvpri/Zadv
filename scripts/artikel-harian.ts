// Cron harian: publish scheduled artikel + generate 1 baru per app.
// Dipanggil cron VPS tiap 07:00 WIB → `npx tsx scripts/artikel-harian.ts`.
//
// Env: DATABASE_URL, GEMINI_API_KEY, GITHUB_TOKEN (wajib), DRY_RUN=1 → skip push.

import prisma from '../src/lib/db'
import { generateSatuArtikel, publishScheduled, todayWib } from '../src/lib/artikel'

async function main() {
  const dryRun = process.env.DRY_RUN === '1'

  // Baca pengaturan dari dashboard
  const settingRows = await prisma.pengaturan.findMany({ where: { kunci: { startsWith: 'artikel_' } } })
  const settings: Record<string, string> = {}
  for (const r of settingRows) settings[r.kunci] = r.nilai

  if (settings.artikel_autopost === 'false') {
    console.log('SKIP: autopost dinonaktifkan dari dashboard.')
    return
  }

  // Cek jam: skip jika belum waktunya (WIB)
  const jam = settings.artikel_jam || '07:00'
  const settingHour = parseInt(jam.split(':')[0])
  const nowWib = new Date(Date.now() + 7 * 3600 * 1000)
  if (nowWib.getUTCHours() < settingHour) {
    console.log(`SKIP: belum waktunya (setting=${jam}, now WIB=${String(nowWib.getUTCHours()).padStart(2, '0')}:00)`)
    return
  }

  const tujuanZomet = settings.artikel_tujuan_zomet !== 'false'
  const tujuanApp = settings.artikel_tujuan_app !== 'false'

  // 1. Publish artikel yang scheduled untuk hari ini
  console.log('1. Publish scheduled articles...')
  const pubResult = await publishScheduled(tujuanZomet, tujuanApp)
  console.log(`   Published: ${pubResult.ok}, Failed: ${pubResult.fail}`)
  if (pubResult.errors.length) pubResult.errors.forEach(e => console.error(`   ✕ ${e}`))

  // 2. Generate 1 artikel baru per app untuk today+3
  const allApps = await prisma.promoApp.findMany({
    where: { aktif: true, artikelAktif: true, url: { not: null } },
    orderBy: { urutan: 'asc' },
  })
  const apps = allApps.filter(a => a.url && a.url.trim().length > 0)

  if (apps.length === 0) {
    console.log('SKIP: tidak ada app dengan web yang aktif.')
    return
  }

  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + 3)
  targetDate.setHours(0, 0, 0, 0)
  const targetYyyymmdd = `${targetDate.getFullYear()}${String(targetDate.getMonth() + 1).padStart(2, '0')}${String(targetDate.getDate()).padStart(2, '0')}`

  console.log(`\n2. Generate artikel baru untuk ${targetYyyymmdd} (${apps.length} app)...${dryRun ? ' DRY_RUN.' : ''}`)

  let okGen = 0
  let failGen = 0

  for (const app of apps) {
    try {
      const existing = await prisma.artikelDraft.findFirst({
        where: { appId: app.id, scheduledFor: targetDate, status: 'scheduled' },
        select: { id: true },
      })
      if (existing) {
        console.log(`  ⊙ [${app.nama}] sudah ada scheduled untuk ${targetYyyymmdd}`)
        continue
      }

      const r = await generateSatuArtikel(app, targetYyyymmdd, { scheduledFor: targetDate, dryRun })
      if (r.ok) {
        okGen++
        console.log(`  ✓ [${app.nama}] ${r.judul}`)
        if (r.fotoUrl) console.log(`    foto: ${r.fotoUrl}`)
      } else {
        failGen++
        console.error(`  ✕ [${app.nama}] ${r.error}`)
      }
    } catch (e) {
      failGen++
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ✕ [${app.nama}] ${msg}`)
    }
    // Jeda 3 detik antar app agar tidak kena rate limit Gemini
    await new Promise(r => setTimeout(r, 3000))
  }

  console.log(`\nSELESAI: published=${pubResult.ok}, generated=${okGen}, failed=${pubResult.fail + failGen}.`)
}

async function isMainModule(): Promise<boolean> {
  const { resolve } = await import('path')
  return !!process.argv[1] && resolve(process.argv[1]) === __filename
}

isMainModule().then((mainModule) => {
  if (!mainModule) return
  main()
    .catch((e) => {
      console.error('Artikel harian GAGAL:', e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
})
