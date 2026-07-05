import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getGeminiKey } from '@/lib/secrets'

const GEMINI_MODEL = 'gemini-3.5-flash'

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

export async function POST(req: Request) {
  const body = await req.json()
  const { appId, platform, tone, variasiLain } = body

  if (!appId || !platform || !tone) {
    return NextResponse.json({ error: 'appId, platform, tone wajib diisi' }, { status: 400 })
  }
  const idNum = Number(appId)
  if (!Number.isInteger(idNum)) return NextResponse.json({ error: 'appId tidak valid' }, { status: 400 })

  const app = await prisma.promoApp.findUnique({ where: { id: idNum } })
  if (!app) return NextResponse.json({ error: 'App tidak ditemukan' }, { status: 404 })

  const platformLabel = PLATFORM_LABEL[platform] || platform
  const toneLabel = TONE_LABEL[tone] || tone

  const prompt = `Buatkan SATU caption promosi untuk platform ${platformLabel}, nada bicara ${toneLabel}, dalam Bahasa Indonesia, untuk produk berikut:

Nama: ${app.nama}
Tagline: ${app.tagline}
Fitur utama: ${app.fitur.join(', ')}
Harga: Rp 100.000/bulan atau Rp 1.000.000/tahun

Aturan:
- Panjang wajar untuk ${platformLabel} (jangan kepanjangan)
- Sertakan call-to-action jelas di akhir
- Kalau Instagram/Facebook, tutup dengan 5-8 hashtag relevan di baris baru
- Kalau WhatsApp, jangan pakai hashtag, buat lebih personal seperti chat langsung
- JANGAN pakai tanda kutip di awal/akhir, JANGAN beri judul atau penjelasan apa pun
- Langsung tulis caption-nya saja${variasiLain ? '\n- Buat versi BERBEDA dari sebelumnya, sudut pandang lain' : ''}`

  let teks: string
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${getGeminiKey()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data?.error?.message || `Gemini API error ${res.status}`)
    }
    teks = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
    if (!teks) throw new Error('Respons kosong')
  } catch (e) {
    console.error('Gagal generate caption:', e)
    return NextResponse.json({ error: 'Gagal generate caption, coba lagi.' }, { status: 502 })
  }

  const saved = await prisma.kontenPromo.create({
    data: { appId: app.id, tipe: 'caption', platform, tone, teks },
  })

  return NextResponse.json({ id: saved.id, teks, createdAt: saved.createdAt })
}
