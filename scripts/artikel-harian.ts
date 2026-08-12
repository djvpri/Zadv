// Cron harian: generate 1 artikel utk app berikutnya (rotasi) lalu publish
// langsung ke repo `djvpri/zomet-main` (content/artikel/). Dipanggil Railway
// cron/service, mis. tiap 07:00 WIB → `npx tsx scripts/artikel-harian.ts`.
//
// Env: DATABASE_URL, GEMINI_API_KEY, GITHUB_TOKEN (wajib), DRY_RUN=1 → skip push.

import prisma from '@/lib/db'
import { getGeminiKey, getGithubToken } from '@/lib/secrets'
import { ANGLES, buatPromptArtikel, callGemini } from '@/lib/artikel'
import { buildFileContent, pushToGitHub } from '@/lib/artikel'

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
  const parsed = JSON.parse(cleaned)
  const { judul, slug, deskripsi, tags, konten } = parsed
  if (!judul || !slug || !deskripsi || !konten) throw new Error('Format JSON dari Gemini tidak lengkap')
  return { judul, slug, deskripsi, tags: Array.isArray(tags) ? tags : [], konten }
}

// Rotasi adil: pilih index app berikutnya SETELAH yang terakhir di-publish
// (urutan array apps, wrap ke awal). `lastAppId` null = belum pernah → app pertama.
export function pilihAppIdx(appIds: number[], lastAppId: number | null): number {
  if (lastAppId != null) {
    const i = appIds.indexOf(lastAppId)
    if (i >= 0) return (i + 1) % appIds.length
  }
  return 0
}

async function main() {
  const { startMs, yyyymmdd } = todayWib()

  // Idempotent: kalau hari ini (WIB) sudah ada artikel published (manual atau cron),
  // skip biar tidak dobel kalau cron overlap / di-jalankan ulang.
  const sudah = await prisma.artikelDraft.findFirst({
    where: { status: 'published', publishedAt: { gte: new Date(startMs) } },
    select: { id: true, appId: true },
  })
  if (sudah) {
    console.log(`SKIP: sudah ada artikel published hari ini (draft #${sudah.id} app ${sudah.appId}).`)
    return
  }

  const apps = await prisma.promoApp.findMany({ where: { aktif: true }, orderBy: { id: 'asc' } })
  if (apps.length === 0) {
    console.log('SKIP: tidak ada app aktif.')
    return
  }

  const last = await prisma.artikelDraft.findFirst({
    where: { status: 'published' },
    orderBy: { publishedAt: 'desc' },
    select: { appId: true },
  })
  const appIds = apps.map((a) => a.id)
  const idx = pilihAppIdx(appIds, last?.appId ?? null)
  const app = apps[idx]
  console.log(`Rotasi: app #${app.id} ${app.nama} (dari ${apps.length} aktif).`)

  // Generate via Gemini (reuse prompt & fetch dari route).
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)].replace('{nama}', app.nama)
  const raw = await callGemini(buatPromptArtikel(app, angle))
  const { judul, slug, deskripsi, tags, konten } = parseGeminiJson(raw)

  const tanggal = yyyymmdd
  const slugAkhir = `${slug}-${tanggal}` // pastikan unik tiap hari, hindari sha-overwrite di GitHub
  const pathArtikel = `content/artikel/${slugAkhir}.md`

  const draft = await prisma.artikelDraft.create({
    data: { appId: app.id, judul, slug, deskripsi, tags, konten, status: 'draft' },
  })
  console.log(`Draft #${draft.id} tersimpan. Publish ke ${pathArtikel} ...`)

  if (process.env.DRY_RUN === '1') {
    console.log('DRY_RUN: push GitHub dilewati.')
    console.log(`URL rencana: https://www.zomet.my.id/artikel/${slugAkhir}`)
    await prisma.artikelDraft.update({ where: { id: draft.id }, data: { status: 'draft' } }).catch(() => {})
    return
  }

  const fileContent = buildFileContent(judul, deskripsi, tags, konten, tanggal)
  const encoded = Buffer.from(fileContent, 'utf-8').toString('base64')
  await pushToGitHub(getGithubToken(), pathArtikel, encoded, `feat: artikel harian - ${judul}`)

  await prisma.artikelDraft.update({
    where: { id: draft.id },
    data: { status: 'published', publishedAt: new Date(), slug: slugAkhir },
  })

  console.log(`SELESAI: ${judul}`)
  console.log(`URL: https://www.zomet.my.id/artikel/${slugAkhir}`)
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