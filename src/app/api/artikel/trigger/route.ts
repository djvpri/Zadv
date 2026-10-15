import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getGithubToken } from '@/lib/secrets'
import { ANGLES, buatPromptArtikel, callGemini, buildFileContent, pushToGitHub, parseGeminiJson, todayWib } from '@/lib/artikel'

// POST /api/artikel/trigger — generate artikel untuk semua app aktif
export async function POST() {
  const apps = await prisma.promoApp.findMany({
    where: { aktif: true, artikelAktif: true },
    orderBy: { urutan: 'asc' },
  })

  if (apps.length === 0) {
    return NextResponse.json({ error: 'Tidak ada app aktif' }, { status: 400 })
  }

  // Baca tujuan publish dari Pengaturan
  const settingRows = await prisma.pengaturan.findMany({ where: { kunci: { startsWith: 'artikel_' } } })
  const settings: Record<string, string> = {}
  for (const r of settingRows) settings[r.kunci] = r.nilai
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
