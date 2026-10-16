// Cron harian: generate artikel utk SEMUA app aktif lalu publish
// ke repo `djvpri/zomet-main` (content/artikel/) dan/atau DB Zadv (untuk /api/artikel/publik).
// Tiap app yang artikelAktif=true dapat 1 artikel per hari.
// Dipanggil cron VPS tiap 07:00 WIB → `npx tsx scripts/artikel-harian.ts`.
//
// Env: DATABASE_URL, GEMINI_API_KEY, GITHUB_TOKEN (wajib), DRY_RUN=1 → skip push.

import prisma from '../src/lib/db'
import { getGithubToken } from '../src/lib/secrets'
import { ANGLES, buatPromptArtikel, callGemini, buildFileContent, pushToGitHub, parseGeminiJson, todayWib } from '../src/lib/artikel'

interface HasilApp {
  appId: number
  nama: string
  status: 'ok' | 'skip' | 'fail'
  judul?: string
  url?: string
  error?: string
}

async function prosesSatuApp(
  app: { id: number; nama: string; tagline: string; fitur: string[]; url?: string | null },
  yyyymmdd: string,
  dryRun: boolean,
  tujuanZomet: boolean,
  tujuanApp: boolean,
): Promise<HasilApp> {
  // Idempotent per app: skip kalau app ini sudah punya artikel published hari ini
  const sudah = await prisma.artikelDraft.findFirst({
    where: { appId: app.id, status: 'published', publishedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    select: { id: true },
  })
  if (sudah) return { appId: app.id, nama: app.nama, status: 'skip' }

  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)].replace('{nama}', app.nama)
  const raw = await callGemini(buatPromptArtikel(app, angle))
  const { judul, slug, deskripsi, tags, konten } = parseGeminiJson(raw)

  const slugAkhir = `${slug}-${yyyymmdd}`

  const draft = await prisma.artikelDraft.create({
    data: { appId: app.id, judul, slug, deskripsi, tags, konten, status: 'draft' },
  })

  if (dryRun) {
    console.log(`  DRY_RUN [${app.nama}]: skip push. URL rencana: https://www.zomet.my.id/artikel/${slugAkhir}`)
    return { appId: app.id, nama: app.nama, status: 'ok', judul, url: `https://www.zomet.my.id/artikel/${slugAkhir}` }
  }

  let published = false
  let url: string | undefined

  if (tujuanZomet) {
    const fileContent = buildFileContent(judul, deskripsi, tags, konten, yyyymmdd)
    const encoded = Buffer.from(fileContent, 'utf-8').toString('base64')
    await pushToGitHub(getGithubToken(), `content/artikel/${slugAkhir}.md`, encoded, `feat: artikel harian - ${judul}`)
    url = `https://www.zomet.my.id/artikel/${slugAkhir}`
    published = true
  }

  // tujuanApp: artikel tersedia via /api/artikel/publik?appId=X — DB publish cukup
  if (tujuanApp) {
    published = true
  }

  if (published) {
    await prisma.artikelDraft.update({
      where: { id: draft.id },
      data: { status: 'published', publishedAt: new Date(), slug: slugAkhir },
    })
  }

  console.log(`  ✓ [${app.nama}] ${judul}`)
  if (url) console.log(`    URL: ${url}`)
  return { appId: app.id, nama: app.nama, status: 'ok', judul, url }
}

async function main() {
  const yyyymmdd = todayWib()
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

  // Hanya app yang punya web (url tidak kosong)
  const allApps = await prisma.promoApp.findMany({
    where: { aktif: true, artikelAktif: true, url: { not: null } },
    orderBy: { urutan: 'asc' },
  })
  const apps = allApps.filter(a => a.url && a.url.trim().length > 0)
  if (apps.length === 0) {
    console.log('SKIP: tidak ada app dengan artikelAktif=true.')
    return
  }

  console.log(`Artikel harian ${yyyymmdd}: ${apps.length} app aktif.${dryRun ? ' DRY_RUN.' : ''}`)
  const hasil: HasilApp[] = []

  for (const app of apps) {
    try {
      const r = await prosesSatuApp(app, yyyymmdd, dryRun, tujuanZomet, tujuanApp)
      hasil.push(r)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ✕ [${app.nama}] ${msg}`)
      hasil.push({ appId: app.id, nama: app.nama, status: 'fail', error: msg })
    }
    // Jeda 3 detik antar app agar tidak kena rate limit Gemini
    await new Promise(r => setTimeout(r, 3000))
  }

  const ok = hasil.filter(h => h.status === 'ok').length
  const skip = hasil.filter(h => h.status === 'skip').length
  const fail = hasil.filter(h => h.status === 'fail').length
  console.log(`\nSELESAI: ${ok} published, ${skip} skip, ${fail} failed.`)
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
