import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getGeminiKey, getGithubToken } from '@/lib/secrets'
import { ANGLES, buatPromptArtikel, callGemini, buildFileContent, pushToGitHub } from '@/lib/artikel'

function parseGeminiJson(raw: string) {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const sanitized = cleaned.replace(/[\x00-\x1f]/g, (ch) => {
    if (ch === '\n') return '\\n'
    if (ch === '\r') return '\\r'
    if (ch === '\t') return '\\t'
    return ''
  })
  const parsed = JSON.parse(sanitized)
  const { judul, slug, deskripsi, tags, konten } = parsed
  if (!judul || !slug || !deskripsi || !konten) throw new Error('Format JSON dari Gemini tidak lengkap')
  return { judul, slug, deskripsi, tags: Array.isArray(tags) ? tags : [], konten }
}

function todayWib(): string {
  const now = new Date()
  const wib = new Date(now.getTime() + 7 * 3600 * 1000)
  const y = wib.getUTCFullYear()
  const m = wib.getUTCMonth()
  const d = wib.getUTCDate()
  return `${y}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`
}

// POST /api/artikel/trigger — generate artikel untuk semua app aktif
export async function POST() {
  const apps = await prisma.promoApp.findMany({
    where: { aktif: true, artikelAktif: true },
    orderBy: { urutan: 'asc' },
  })

  if (apps.length === 0) {
    return NextResponse.json({ error: 'Tidak ada app aktif' }, { status: 400 })
  }

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
      const pathArtikel = `content/artikel/${slugAkhir}.md`

      const draft = await prisma.artikelDraft.create({
        data: { appId: app.id, judul, slug, deskripsi, tags, konten, status: 'draft' },
      })

      const fileContent = buildFileContent(judul, deskripsi, tags, konten, yyyymmdd)
      const encoded = Buffer.from(fileContent, 'utf-8').toString('base64')
      await pushToGitHub(getGithubToken(), pathArtikel, encoded, `feat: artikel harian - ${judul}`)

      await prisma.artikelDraft.update({
        where: { id: draft.id },
        data: { status: 'published', publishedAt: new Date(), slug: slugAkhir },
      })

      ok++
    } catch (e) {
      fail++
      errors.push(`${app.nama}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ ok, fail, errors })
}
