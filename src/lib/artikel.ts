// Helper bersama untuk generate & publish artikel (dipakai route API + script cron).
// Ditempatkan di sini (bukan di file route.ts) karena Next.js route file cuma boleh
// mengekspor handler/metadata — helper bertipe non-Route yang di-export dari route
// membikin `next build` gagal: 'X is not a valid Route export field'.
import { getGeminiKey, getGithubToken } from './secrets'

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
  const imageLine = gambarPath ? `\nimage: "${gambarPath}"` : ''
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
