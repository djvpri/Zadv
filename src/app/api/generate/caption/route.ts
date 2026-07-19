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

  // Deteksi ZOne: fokus ke rekrutmen mitra afiliasi, bukan pengguna SaaS
  const isZOne = app.nama === 'ZOne'

  const videoContextBlock = isZOne
    ? `Nama: ${app.nama}
Tagline: ${app.tagline}
Fitur program mitra: ${app.fitur.join(', ')}

Sudut pandang (PENTING):
- Ini adalah program afiliasi/mitra, bukan produk software untuk dipakai sendiri
- Target penonton: siapa saja yang ingin penghasilan tambahan tanpa modal
- Pesannya: bergabunglah sebagai mitra Zomet, pasarkan 13+ app SaaS, raih komisi setiap bulan`
    : `Nama: ${app.nama}
Tagline: ${app.tagline}
Fitur utama: ${app.fitur.join(', ')}
Harga: Rp 100.000/bulan`

  const videoCTAHint = isZOne
    ? '"Daftar jadi mitra sekarang!" atau "Yuk mulai hasilkan komisi!"'
    : '"Daftar sekarang!" atau "Yuk coba gratis!"'

  const deskripsiContextBlock = isZOne
    ? `Konteks program:
- Ini adalah program afiliasi/mitra Zomet, bukan software untuk dipakai sendiri
- Target pembaca: orang yang ingin penghasilan tambahan tanpa modal
- Sudut pandang: undang mereka bergabung sebagai mitra, pasarkan 13+ app SaaS, dapat komisi
- Fitur program: ${app.fitur.join(', ')}

Aturan:
- Panjang 2-3 kalimat
- Fokus pada kesempatan penghasilan, kemudahan bergabung, dan portofolio app yang besar
- CTA: ajak mendaftar sebagai mitra/afiliasi`
    : `Konteks produk:
- Ini adalah aplikasi/software bisnis, BUKAN layanan untuk konsumen akhir
- Target pembaca: pemilik usaha atau pengelola bisnis yang butuh solusi ini
- Fitur: ${app.fitur.join(', ')}

Aturan:
- Panjang 2-3 kalimat
- Fokus pada manfaat bagi pemilik bisnis/pengelola, bukan pelanggan bisnis tersebut
- Sertakan CTA yang mendorong pemilik bisnis untuk mencoba`

  try {
    // Format video: generate skrip subtitle + deskripsi + tags
    if (format === 'video') {
      const promptScript = `Buatkan skrip narasi video promosi untuk ${platformLabel}, nada ${toneLabel}, Bahasa Indonesia, untuk produk berikut:

${videoContextBlock}

Aturan skrip:
- 15-20 baris pendek, tiap baris MAX 8 kata
- Tiap baris = satu subtitle yang muncul ~3 detik di video
- Mulai dengan hook yang menarik perhatian (masalah/pertanyaan)
- Tengah: solusi dan fitur unggulan
- Akhir: CTA singkat dan kuat, contoh: ${videoCTAHint}
- JANGAN tulis URL di dalam skrip, URL akan ditambahkan otomatis di baris terakhir
- HANYA tulis baris-baris skrip saja, tanpa penomoran, tanpa judul, tanpa tanda kutip
- Pisahkan tiap baris dengan newline`

      const promptDeskripsi = `Buatkan deskripsi postingan ${platformLabel} untuk video promosi ${app.nama} (${app.tagline}), nada ${toneLabel}, Bahasa Indonesia.

${deskripsiContextBlock}
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

      // Pastikan baris terakhir adalah URL app yang benar
      const scriptFinal = scriptRaw.trim() + (app.url ? '\n' + app.url : '')

      await prisma.kontenPromo.create({
        data: { appId: app.id, tipe: 'video_script', platform, tone, teks: scriptFinal },
      })

      return NextResponse.json({ script: scriptFinal, deskripsi, tags })
    }

    // Format caption biasa
    const captionContextBlock = isZOne
      ? `Nama: ${app.nama}
Tagline: ${app.tagline}
Fitur program mitra: ${app.fitur.join(', ')}

Konteks penting:
- Ini adalah program afiliasi/mitra Zomet, bukan software untuk dipakai sendiri
- Target pembaca: siapa saja yang ingin penghasilan tambahan tanpa modal
- Pesan utama: bergabunglah sebagai mitra, pasarkan 13+ app SaaS Zomet, raih komisi tiap bulan`
      : `Nama: ${app.nama}
Tagline: ${app.tagline}
Fitur utama: ${app.fitur.join(', ')}
Harga: Rp 100.000/bulan atau Rp 1.000.000/tahun

Konteks penting:
- Ini adalah aplikasi/software bisnis, BUKAN layanan untuk konsumen akhir
- Target pembaca caption: pemilik usaha atau pengelola bisnis yang butuh solusi ini`

    const captionFocusLine = isZOne
      ? '- Fokus pada peluang penghasilan, kemudahan bergabung, portofolio app yang besar, dan komisi menarik'
      : '- Fokus pada manfaat bagi pemilik bisnis/pengelola, bukan pelanggan bisnis tersebut'

    const captionCTAHint = isZOne
      ? '- Sertakan call-to-action yang mendorong pembaca untuk mendaftar sebagai mitra/afiliasi'
      : '- Sertakan call-to-action jelas di akhir'

    const prompt = `Buatkan SATU caption promosi untuk platform ${platformLabel}, nada bicara ${toneLabel}, dalam Bahasa Indonesia, untuk produk berikut:

${captionContextBlock}

Aturan:
- Panjang wajar untuk ${platformLabel}
${captionFocusLine}
${captionCTAHint}
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
