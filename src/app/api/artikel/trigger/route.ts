import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getGithubToken } from '@/lib/secrets'
import { ANGLES, buatPromptArtikel, callGemini, buildFileContent, pushToGitHub, parseGeminiJson, todayWib } from '@/lib/artikel'

// POST /api/artikel/trigger — generate artikel untuk semua app aktif
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

  // Hanya app yang punya web (url tidak kosong)
  const allApps = await prisma.promoApp.findMany({
    where: { aktif: true, artikelAktif: true, url: { not: null } },
    orderBy: { urutan: 'asc' },
  })
  const apps = allApps.filter(a => a.url && a.url.trim().length > 0)

  if (apps.length === 0) {
    return NextResponse.json({ ok: 0, fail: 0, errors: [], skip: 'tidak ada app dengan web yang aktif' })
  }

  const tujuanZomet = settings.artikel_tujuan_zomet !== 'false'
  const tujuanApp = settings.artikel_tujuan_app !== 'false'

  const yyyymmdd = todayWib()
  let ok = 0
  let fail = 0
  const errors: string[] = []

  for (const app of apps) {
    try {
      // Skip kalau sudah published dalam 24 jam
      const sudah = await prisma.artikelDraft.findFirst({
        where: { appId: app.id, status: 'published', publishedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
        select: { id: true },
      })
      if (sudah) { ok++; continue }

      const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)].replace('{nama}', app.nama)
      const raw = await callGemini(buatPromptArtikel(app, angle))
      const { judul, slug, deskripsi, tags, konten } = parseGeminiJson(raw)

      const slugAkhir = `${slug}-${yyyymmdd}`

      const draft = await prisma.artikelDraft.create({
        data: { appId: app.id, judul, slug, deskripsi, tags, konten, status: 'draft' },
      })

      let published = false

      if (tujuanZomet) {
        const fileContent = buildFileContent(judul, deskripsi, tags, konten, yyyymmdd)
        const encoded = Buffer.from(fileContent, 'utf-8').toString('base64')
        await pushToGitHub(getGithubToken(), `content/artikel/${slugAkhir}.md`, encoded, `feat: artikel harian - ${judul}`)
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

      ok++
    } catch (e) {
      fail++
      errors.push(`${app.nama}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ ok, fail, errors })
}
