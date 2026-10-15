// Cron harian: generate artikel utk SEMUA app aktif lalu publish
// ke repo `djvpri/zomet-main` (content/artikel/). Tiap app yang
// artikelAktif=true dapat 1 artikel per hari. Dipanggil cron VPS
// tiap 07:00 WIB → `npx tsx scripts/artikel-harian.ts`.
//
// Env: DATABASE_URL, GEMINI_API_KEY, GITHUB_TOKEN (wajib), DRY_RUN=1 → skip push.

import prisma from '../src/lib/db'
import { getGeminiKey, getGithubToken } from '../src/lib/secrets'
import { ANGLES, buatPromptArtikel, callGemini, buildFileContent, pushToGitHub } from '../src/lib/artikel'

// Tanggal "hari ini" dalam WIB (UTC+7). Mulai hari = pergeseran UTC agar rentang
// idempotent dipakai konsisten antara jam publish (07:00 WIB = 00:00 UTC).
export function todayWib(): { startMs: number; yyyymmdd: string } {
  const now = new Date()
  const wib = new Date(now.getTime() + 7 * 3600 * 1000)
  const y = wib.getUTCFullYear()
  const m = wib.getUTCMonth()
  const d = wib.getUTCDate()
  const startMs = Date.UTC(y, m, d)
  const yyyymmdd = `${y}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`
  return { startMs, yyyymmdd }
}

function parseGeminiJson(raw: string) {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  // Gemini kadang sisipkan control char (newline/tab mentah) di dalam string literal JSON.
  // Tapi newline/tab antar key-value adalah whitespace valid di JSON — JANGAN di-escape.
  // Hanya escape control char yang berada DI DALAM string literal (antara tanda kutip).
  const sanitized = cleaned.replace(/[\x00-\x1f]/g, (ch) => {
    return ''
  })
  if (sanitized.length < 2) {
    throw new Error(`Respons Gemini kosong/singkat: len=${raw.length}, first=${JSON.stringify(raw.slice(0,50))}`)
  }
  const parsed = JSON.parse(sanitized)
  const { judul, slug, deskripsi, tags, konten } = parsed
  if (!judul || !slug || !deskripsi || !konten) throw new Error('Format JSON dari Gemini tidak lengkap')
  return { judul, slug, deskripsi, tags: Array.isArray(tags) ? tags : [], konten }
}

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

  const tanggal = yyyymmdd
  const slugAkhir = `${slug}-${tanggal}`
  const pathArtikel = `content/artikel/${slugAkhir}.md`

  const draft = await prisma.artikelDraft.create({
    data: { appId: app.id, judul, slug, deskripsi, tags, konten, status: 'draft' },
  })

  if (dryRun) {
    console.log(`  DRY_RUN [${app.nama}]: skip push. URL rencana: https://www.zomet.my.id/artikel/${slugAkhir}`)
    return { appId: app.id, nama: app.nama, status: 'ok', judul, url: `https://www.zomet.my.id/artikel/${slugAkhir}` }
  }

  const fileContent = buildFileContent(judul, deskripsi, tags, konten, tanggal)
  const encoded = Buffer.from(fileContent, 'utf-8').toString('base64')
  await pushToGitHub(getGithubToken(), pathArtikel, encoded, `feat: artikel harian - ${judul}`)

  await prisma.artikelDraft.update({
    where: { id: draft.id },
    data: { status: 'published', publishedAt: new Date(), slug: slugAkhir },
  })

  const url = `https://www.zomet.my.id/artikel/${slugAkhir}`
  console.log(`  ✓ [${app.nama}] ${judul}`)
  console.log(`    URL: ${url}`)
  return { appId: app.id, nama: app.nama, status: 'ok', judul, url }
}

async function main() {
  const { yyyymmdd } = todayWib()
  const dryRun = process.env.DRY_RUN === '1'

  // Cek autopost toggle dari Pengaturan
  const setting = await prisma.pengaturan.findUnique({ where: { kunci: 'artikel_autopost' } })
  if (setting && setting.nilai === 'false') {
    console.log('SKIP: autopost dinonaktifkan dari dashboard.')
    return
  }

  const apps = await prisma.promoApp.findMany({
    where: { aktif: true, artikelAktif: true },
    orderBy: { urutan: 'asc' },
  })
  if (apps.length === 0) {
    console.log('SKIP: tidak ada app dengan artikelAktif=true.')
    return
  }

  console.log(`Artikel harian ${yyyymmdd}: ${apps.length} app aktif.${dryRun ? ' DRY_RUN.' : ''}`)
  const hasil: HasilApp[] = []

  for (const app of apps) {
    try {
      const r = await prosesSatuApp(app, yyyymmdd, dryRun)
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

// Hanya jalankan saat file dieksekusi langsung (bukan di-import test/unit).
isMainModule().then((mainModule) => {
  if (!mainModule) return
  main()
    .catch((e) => {
      console.error('Artikel harian GAGAL:', e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
})
