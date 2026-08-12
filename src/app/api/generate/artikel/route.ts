import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { ANGLES, buatPromptArtikel, callGemini } from '@/lib/artikel'

export async function POST(req: Request) {
  const { appId } = await req.json()
  if (!appId) return NextResponse.json({ error: 'appId wajib diisi' }, { status: 400 })

  const app = await prisma.promoApp.findUnique({ where: { id: Number(appId) } })
  if (!app) return NextResponse.json({ error: 'App tidak ditemukan' }, { status: 404 })

  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)].replace('{nama}', app.nama)
  const today = new Date().toISOString().slice(0, 10)

  const prompt = buatPromptArtikel(app, angle)

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
