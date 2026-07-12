import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getGeminiKey } from '@/lib/secrets'

const GEMINI_MODEL = 'gemini-2.5-flash'

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
}

const TONE_LABEL: Record<string, string> = {
  santai: 'Santai',
  profesional: 'Profesional',
  urgent: 'Promo/FOMO',
}

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${getGeminiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Gemini API error ${res.status}`)
  const teks = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
  if (!teks) throw new Error('Respons kosong dari Gemini')
  return teks
}

export async function POST(req: Request) {
  const body = await req.json()
  const { appId, platform, tone, variasiLain, format } = body

  if (!appId || !platform || !tone) {
    return NextResponse.json({ error: 'appId, platform, tone wajib diisi' }, { status: 400 })
  }
  const idNum = Number(appId)
  if (!Number.isInteger(idNum)) return NextResponse.json({ error: 'appId tidak valid' }, { status: 400 })

  const app = await prisma.promoApp.findUnique({ where: { id: idNum } })
  if (!app) return NextResponse.json({ error: 'App tidak ditemukan' }, { status: 404 })

  const platformLabel = PLATFORM_LABEL[platform] || platform
  const toneLabel = TONE_LABEL[tone] || tone

  try {
    // Format video: generate skrip subtitle + deskripsi + tags
    if (format === 'video') {
      const promptScript = `Buatkan skrip narasi video promosi untuk ${platformLabel}, nada ${toneLabel}, Bahasa Indonesia, untuk produk berikut:

Nama: ${app.nama}
Tagline: ${app.tagline}
Fitur utama: ${app.fitur.join(', ')}
Harga: Rp 100.000/bulan

Aturan skrip:
- 15-20 baris pendek, tiap baris MAX 8 kata
- Tiap baris = satu subtitle yang muncul ~3 detik di video
- Mulai dengan hook yang menarik perhatian (masalah/pertanyaan)
- Tengah: solusi dan fitur unggulan
- Akhir: CTA singkat dan kuat, contoh: "Daftar sekarang!" atau "Yuk coba gratis!"
- JANGAN tulis URL di dalam skrip, URL akan ditambahkan otomatis di baris terakhir
- HANYA tulis baris-baris skrip saja, tanpa penomoran, tanpa judul, tanpa tanda kutip
- Pisahkan tiap baris dengan newline`

      const promptDeskripsi = `Buatkan deskripsi postingan ${platformLabel} untuk video promosi ${app.nama} (${app.tagline}), nada ${toneLabel}, Bahasa Indonesia.
- Panjang 2-3 kalimat
- Sertakan CTA
${platform !== 'whatsapp' ? '- Akhiri dengan 5-8 hashtag relevan di baris baru' : '- Tanpa hashtag, lebih personal'}
- HANYA tulis deskripsinya saja, tanpa judul atau penjelasan`

      const [scriptRaw, deskripsiRaw] = await Promise.all([
        callGemini(promptScript),
        callGemini(promptDeskripsi),
      ])

      // Parse deskripsi dan tags
      const lines = deskripsiRaw.split('\n')
      const hashtagLine = lines.find(l => l.includes('#'))
      const deskripsi = lines.filter(l => !l.startsWith('#') && l.trim()).join(' ').trim()
      const tags = hashtagLine
        ? hashtagLine.match(/#\w+/g) || []
        : []

      await prisma.kontenPromo.create({
        data: { appId: app.id, tipe: 'video_script', platform, tone, teks: scriptFinal },
      })

      // Pastikan baris terakhir adalah URL app yang benar
      const scriptFinal = scriptRaw.trim() + (app.url ? '\n' + app.url : '')
      return NextResponse.json({ script: scriptFinal, deskripsi, tags })
    }

    // Format caption biasa
    const prompt = `Buatkan SATU caption promosi untuk platform ${platformLabel}, nada bicara ${toneLabel}, dalam Bahasa Indonesia, untuk produk berikut:

Nama: ${app.nama}
Tagline: ${app.tagline}
Fitur utama: ${app.fitur.join(', ')}
Harga: Rp 100.000/bulan atau Rp 1.000.000/tahun

Aturan:
- Panjang wajar untuk ${platformLabel}
- Sertakan call-to-action jelas di akhir
- Kalau Instagram/Facebook, tutup dengan 5-8 hashtag relevan di baris baru
- Kalau WhatsApp, jangan pakai hashtag, buat lebih personal
- JANGAN pakai tanda kutip di awal/akhir, JANGAN beri judul atau penjelasan apa pun
- Langsung tulis caption-nya saja${variasiLain ? '\n- Buat versi BERBEDA dari sebelumnya, sudut pandang lain' : ''}`

    const teks = await callGemini(prompt)

    const saved = await prisma.kontenPromo.create({
      data: { appId: app.id, tipe: 'caption', platform, tone, teks },
    })

    return NextResponse.json({ id: saved.id, teks, createdAt: saved.createdAt })
  } catch (e) {
    console.error('Gagal generate:', e)
    return NextResponse.json({ error: 'Gagal generate, coba lagi.' }, { status: 502 })
  }
}
