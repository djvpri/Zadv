// Helper bersama untuk generate & publish artikel (dipakai route API + script cron).
// Ditempatkan di sini (bukan di file route.ts) karena Next.js route file cuma boleh
// mengekspor handler/metadata — helper bertipe non-Route yang di-export dari route
// membikin `next build` gagal: 'X is not a valid Route export field'.
import { getGeminiKey, getGithubToken } from './secrets'
import prisma from './db'

const GEMINI_MODEL = 'gemini-2.5-flash'

export const ANGLES = [
  'masalah nyata yang dialami UMKM dan bagaimana {nama} menyelesaikannya',
  'panduan lengkap memulai bisnis digital dengan bantuan {nama}',
  'mengapa bisnis yang belum pakai {nama} sedang tertinggal dari kompetitor',
  'perbandingan cara manual vs cara digital menggunakan {nama}',
  'tips memaksimalkan omzet dengan fitur-fitur unggulan {nama}',
  'kisah sukses UMKM yang beralih ke {nama} dan hasilnya',
  'pertanyaan yang sering ditanyakan tentang {nama} — dijawab tuntas',
  'revolusi digitalisasi bisnis: peran {nama} untuk UMKM Indonesia',
]

export function buatPromptArtikel(app: { nama: string; tagline: string; fitur: string[]; url?: string | null }, angle: string): string {
  const appUrl = app.url || 'https://zomet.my.id'
  return `Kamu adalah content writer SEO profesional untuk blog teknologi bisnis Indonesia.

Buatkan artikel blog lengkap tentang aplikasi SaaS berikut dengan sudut pandang: "${angle}"

Data Aplikasi:
- Nama: ${app.nama}
- Tagline: ${app.tagline}
- Fitur utama: ${app.fitur.join(', ')}
- URL: ${appUrl}

Ketentuan artikel:
- Bahasa Indonesia yang natural, informatif, dan mudah dipahami pemilik UMKM
- Panjang konten minimal 600 kata, maksimal 900 kata
- Gunakan heading ## untuk sub-judul utama, ### untuk sub-heading
- Sertakan bullet points untuk fitur/manfaat
- Akhiri dengan paragraf CTA yang mengarahkan ke ${appUrl}
- Jangan sebut harga spesifik
- JANGAN sertakan image atau gambar apapun

Kembalikan HANYA JSON tanpa markdown code block, dengan format:
{
  "judul": "judul artikel menarik dan SEO-friendly, maksimal 70 karakter",
  "slug": "slug-url-dari-judul-tanpa-karakter-spesial",
  "deskripsi": "meta deskripsi 150-160 karakter yang menarik untuk SEO",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "konten": "isi artikel lengkap dalam format markdown"
}`
}

export async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${getGeminiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Gemini error ${res.status}`)
  const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
  if (!raw) throw new Error('Respons kosong dari Gemini')
  return raw
}

export function todayWib(): string {
  const now = new Date()
  const wib = new Date(now.getTime() + 7 * 3600 * 1000)
  const y = wib.getUTCFullYear()
  const m = wib.getUTCMonth()
  const d = wib.getUTCDate()
  return `${y}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`
}

export function parseGeminiJson(raw: string) {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  // Strip semua control char — newline antar key valid di JSON, strip aman karena
  // JSON.parse tetap handle struktur tanpa whitespace.
  const sanitized = cleaned.replace(/[\x00-\x1f]/g, '')
  if (sanitized.length < 2) {
    throw new Error(`Respons Gemini kosong/singkat: len=${raw.length}, first=${JSON.stringify(raw.slice(0, 50))}`)
  }
  const parsed = JSON.parse(sanitized)
  const { judul, slug, deskripsi, tags, konten } = parsed
  if (!judul || !slug || !deskripsi || !konten) throw new Error('Format JSON dari Gemini tidak lengkap')
  return { judul, slug, deskripsi, tags: Array.isArray(tags) ? tags : [], konten }
}

export const OWNER = 'djvpri'
export const REPO = 'zomet-main'
export const BRANCH = 'main'
const BASE_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents`

function youtubeEmbedId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

export function buildFileContent(
  judul: string,
  deskripsi: string,
  tags: string[],
  konten: string,
  date: string,
  gambarPath?: string,
  youtubeUrl?: string,
): string {
  // Normalisasi tanggal: terima '20260812' (cron) atau '2026-08-12' (manual),
  // keluarkan ISO YYYY-MM-DD agar halaman list zomet-main bisa parse (new Date) & sort.
  if (/^\d{8}$/.test(date)) {
    date = date.slice(0, 4) + '-' + date.slice(4, 6) + '-' + date.slice(6, 8)
  }
  const tagYaml = tags.map(t => `  - "${t}"`).join('\n')
  // Untuk zomet-main markdown: image harus absolute URL (zomet-main tidak host /api/uploads)
  // Untuk app landing: gambarPath relative OK (imgUrl helper resolve ke ZADV_API)
  const imageUrl = gambarPath
    ? (/^https?:\/\//.test(gambarPath) ? gambarPath : `${process.env.ZADV_PUBLIC_URL || 'http://zpromo.zomet.my.id'}${gambarPath}`)
    : undefined
  const imageLine = imageUrl ? `\nimage: "${imageUrl}"` : ''
  const youtubeLine = youtubeUrl ? `\nyoutube: "${youtubeUrl}"` : ''

  let body = konten

  // Sisipkan embed YouTube di awal konten jika ada
  if (youtubeUrl) {
    const vid = youtubeEmbedId(youtubeUrl)
    if (vid) {
      const embedBlock = `\n<div class="video-embed">\n  <iframe src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen></iframe>\n</div>\n\n`
      body = embedBlock + konten
    }
  }

  return `---
title: "${judul.replace(/"/g, '\\"')}"
description: "${deskripsi.replace(/"/g, '\\"')}"
date: "${date}"${imageLine}${youtubeLine}
tags:
${tagYaml}
---

${body}`
}

export async function pushToGitHub(
  token: string,
  filePath: string,
  contentBase64: string,
  commitMessage: string,
) {
  const fileUrl = `${BASE_URL}/${filePath}`
  let sha: string | undefined
  const checkRes = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (checkRes.ok) {
    const existing = await checkRes.json()
    sha = existing.sha
  }
  const body: Record<string, string> = { message: commitMessage, content: contentBase64, branch: BRANCH }
  if (sha) body.sha = sha
  const pushRes = await fetch(fileUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!pushRes.ok) {
    const err = await pushRes.json()
    throw new Error('Gagal push ke GitHub: ' + (err.message || pushRes.status))
  }
}

// ============ IDE POOL ============
// Priority: app-specific → global → null (auto Gemini)
export async function ambilIde(appId: number): Promise<{ id: number; teks: string } | null> {
  // 1. App-specific pending (oldest first)
  const appIde = await prisma.artikelIde.findFirst({
    where: { appId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  })
  if (appIde) return { id: appIde.id, teks: appIde.teks }

  // 2. Global pool pending (oldest first)
  const globalIde = await prisma.artikelIde.findFirst({
    where: { appId: null, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  })
  if (globalIde) return { id: globalIde.id, teks: globalIde.teks }

  return null
}

export async function tandaiIdeUsed(ideId: number, artikelId: number) {
  await prisma.artikelIde.update({
    where: { id: ideId },
    data: { status: 'used', artikelId, usedAt: new Date() },
  })
}

// ============ FOTO LRU MATCHING ============
// Priority chain:
// 1. App + tag match
// 2. App only (any tag)
// 3. Global + tag match
// 4. Global random (any tag)
// 5. null (no foto)
export async function ambilFoto(appId: number, articleTags: string[]): Promise<{ id: number; url: string } | null> {
  const lowerTags = articleTags.map(t => t.toLowerCase())

  // 1. App + tag match (LRU: lastUsedAt NULLS FIRST)
  let foto = await prisma.artikelFoto.findFirst({
    where: { appId, tags: { hasSome: lowerTags } },
    orderBy: [{ lastUsedAt: { sort: 'asc', nulls: 'first' } }, { useCount: 'asc' }],
  })
  if (foto) return { id: foto.id, url: foto.url }

  // 2. App only
  foto = await prisma.artikelFoto.findFirst({
    where: { appId },
    orderBy: [{ lastUsedAt: { sort: 'asc', nulls: 'first' } }, { useCount: 'asc' }],
  })
  if (foto) return { id: foto.id, url: foto.url }

  // 3. Global + tag match
  foto = await prisma.artikelFoto.findFirst({
    where: { appId: null, tags: { hasSome: lowerTags } },
    orderBy: [{ lastUsedAt: { sort: 'asc', nulls: 'first' } }, { useCount: 'asc' }],
  })
  if (foto) return { id: foto.id, url: foto.url }

  // 4. Global random
  foto = await prisma.artikelFoto.findFirst({
    where: { appId: null },
    orderBy: [{ lastUsedAt: { sort: 'asc', nulls: 'first' } }, { useCount: 'asc' }],
  })
  if (foto) return { id: foto.id, url: foto.url }

  return null
}

export async function tandaiFotoUsed(fotoId: number) {
  await prisma.artikelFoto.update({
    where: { id: fotoId },
    data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
  })
}

// ============ GENERATE HELPER ============
// Shared antara trigger (daily) dan pre-generate (batch).
// Mengembalikan artikel draft + foto yang terpilih.
export interface GenerateResult {
  ok: boolean
  draftId?: number
  judul?: string
  slug?: string
  fotoUrl?: string
  error?: string
}

export async function generateSatuArtikel(
  app: { id: number; nama: string; tagline: string; fitur: string[]; url?: string | null },
  yyyymmdd: string,
  options?: {
    scheduledFor?: Date        // jika pre-generate, set target date
    ideOverride?: string       // jika ada ide manual, skip pool
    dryRun?: boolean
  },
): Promise<GenerateResult> {
  const dryRun = options?.dryRun ?? false

  // Ambil ide dari pool (atau override)
  const ide = options?.ideOverride
    ? null
    : await ambilIde(app.id)

  // Bangun prompt: kalau ada ide, pakai ide sebagai angle
  let angle: string
  if (ide) {
    angle = ide.teks
  } else if (options?.ideOverride) {
    angle = options.ideOverride
  } else {
    angle = ANGLES[Math.floor(Math.random() * ANGLES.length)].replace('{nama}', app.nama)
  }

  const raw = await callGemini(buatPromptArtikel(app, angle))
  const { judul, slug, deskripsi, tags, konten } = parseGeminiJson(raw)
  const slugAkhir = `${slug}-${yyyymmdd}`

  // Ambil foto via LRU matching
  const foto = await ambilFoto(app.id, tags)
  const fotoUrl = foto?.url || undefined

  const draft = await prisma.artikelDraft.create({
    data: {
      appId: app.id,
      judul, slug: slugAkhir, deskripsi, tags, konten,
      status: options?.scheduledFor ? 'scheduled' : 'draft',
      scheduledFor: options?.scheduledFor,
      fotoId: foto?.id,
      gambarPath: foto?.url,
      ideId: ide?.id,
    },
  })

  // Tandai ide sebagai used
  if (ide) await tandaiIdeUsed(ide.id, draft.id)
  // Tandai foto LRU
  if (foto) await tandaiFotoUsed(foto.id)

  if (dryRun) {
    return { ok: true, draftId: draft.id, judul, slug: slugAkhir, fotoUrl }
  }

  return { ok: true, draftId: draft.id, judul, slug: slugAkhir, fotoUrl }
}

// ============ PUBLISH SCHEDULED ============
// Publish artikel yang scheduledFor = today.
// Dipanggil cron harian sebelum generate baru.
export async function publishScheduled(
  tujuanZomet: boolean,
  tujuanApp: boolean,
): Promise<{ ok: number; fail: number; errors: string[] }> {
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 3600 * 1000)

  const scheduled = await prisma.artikelDraft.findMany({
    where: {
      status: 'scheduled',
      scheduledFor: { gte: todayStart, lt: todayEnd },
    },
    include: { app: { select: { nama: true, emoji: true } } },
  })

  let ok = 0
  let fail = 0
  const errors: string[] = []

  for (const draft of scheduled) {
    try {
      // Guard: skip kalau app ini sudah published hari ini (cegah dobel publish)
      const alreadyPublished = await prisma.artikelDraft.findFirst({
        where: {
          appId: draft.appId,
          status: 'published',
          publishedAt: { gte: todayStart, lt: todayEnd },
        },
        select: { id: true },
      })
      if (alreadyPublished) {
        console.log(`  ⊙ [${draft.app?.nama}] sudah published hari ini, skip`)
        continue
      }

      let published = false
      const yyyymmdd = draft.scheduledFor!
        ? `${draft.scheduledFor.getFullYear()}${String(draft.scheduledFor.getMonth() + 1).padStart(2, '0')}${String(draft.scheduledFor.getDate()).padStart(2, '0')}`
        : todayWib()

      // Foto fallback: kalau draft.gambarPath null (pool kosong saat generate),
      // coba ambilFoto ulang saat publish (pool mungkin sudah diisi setelah generate).
      let gambarPath = draft.gambarPath
      if (!gambarPath) {
        const foto = await ambilFoto(draft.appId, draft.tags)
        if (foto) {
          gambarPath = foto.url
          await prisma.artikelDraft.update({
            where: { id: draft.id },
            data: { fotoId: foto.id, gambarPath: foto.url },
          })
          if (foto?.id) await tandaiFotoUsed(foto.id)
        }
      }

      if (tujuanZomet) {
        const fileContent = buildFileContent(draft.judul, draft.deskripsi, draft.tags, draft.konten, yyyymmdd, gambarPath || undefined, draft.youtubeUrl || undefined)
        const encoded = Buffer.from(fileContent, 'utf-8').toString('base64')
        await pushToGitHub(getGithubToken(), `content/artikel/${draft.slug}.md`, encoded, `feat: artikel scheduled - ${draft.judul}`)
        published = true
      }

      if (tujuanApp) {
        published = true
      }

      if (published) {
        await prisma.artikelDraft.update({
          where: { id: draft.id },
          data: { status: 'published', publishedAt: new Date() },
        })
      }

      ok++
    } catch (e) {
      fail++
      errors.push(`${draft.app?.nama || 'unknown'}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { ok, fail, errors }
}
