import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getGeminiKey } from '@/lib/secrets'

const GEMINI_MODEL = 'gemini-2.5-flash'

const ANGLES = [
  'masalah nyata yang dialami UMKM dan bagaimana {nama} menyelesaikannya',
  'panduan lengkap memulai bisnis digital dengan bantuan {nama}',
  'mengapa bisnis yang belum pakai {nama} sedang tertinggal dari kompetitor',
  'perbandingan cara manual vs cara digital menggunakan {nama}',
  'tips memaksimalkan omzet dengan fitur-fitur unggulan {nama}',
  'kisah sukses UMKM yang beralih ke {nama} dan hasilnya',
  'pertanyaan yang sering ditanyakan tentang {nama} — dijawab tuntas',
  'revolusi digitalisasi bisnis: peran {nama} untuk UMKM Indonesia',
]

async function callGemini(prompt: string): Promise<string> {
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

export async function POST(req: Request) {
  const { appId } = await req.json()
  if (!appId) return NextResponse.json({ error: 'appId wajib diisi' }, { status: 400 })

  const app = await prisma.promoApp.findUnique({ where: { id: Number(appId) } })
  if (!app) return NextResponse.json({ error: 'App tidak ditemukan' }, { status: 404 })

  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)].replace('{nama}', app.nama)
  const today = new Date().toISOString().slice(0, 10)

  const prompt = `Kamu adalah content writer SEO profesional untuk blog teknologi bisnis Indonesia.

Buatkan artikel blog lengkap tentang aplikasi SaaS berikut dengan sudut pandang: "${angle}"

Data Aplikasi:
- Nama: ${app.nama}
- Tagline: ${app.tagline}
- Fitur utama: ${app.fitur.join(', ')}
- URL: ${app.url || 'https://zomet.my.id'}

Ketentuan artikel:
- Bahasa Indonesia yang natural, informatif, dan mudah dipahami pemilik UMKM
- Panjang konten minimal 600 kata, maksimal 900 kata
- Gunakan heading ## untuk sub-judul utama, ### untuk sub-heading
- Sertakan bullet points untuk fitur/manfaat
- Akhiri dengan paragraf CTA yang mengarahkan ke ${app.url || 'https://zomet.my.id'}
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

  try {
    const raw = await callGemini(prompt)
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    const parsed = JSON.parse(cleaned)

    const { judul, slug, deskripsi, tags, konten } = parsed
    if (!judul || !slug || !deskripsi || !konten) {
      throw new Error('Format JSON dari Gemini tidak lengkap')
    }

    const saved = await prisma.artikelDraft.create({
      data: {
        appId: app.id,
        judul,
        slug,
        deskripsi,
        tags: Array.isArray(tags) ? tags : [],
        konten,
        status: 'draft',
      },
    })

    return NextResponse.json({ id: saved.id, judul, slug, deskripsi, tags: saved.tags, konten, date: today })
  } catch (e) {
    console.error('Generate artikel gagal:', e)
    return NextResponse.json({ error: 'Gagal generate artikel, coba lagi.' }, { status: 502 })
  }
}
