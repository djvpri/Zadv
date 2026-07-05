import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const idNum = Number(id)
  if (!Number.isInteger(idNum)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 })

  const body = await req.json()
  try {
    const app = await prisma.promoApp.update({
      where: { id: idNum },
      data: {
        nama: body.nama,
        emoji: body.emoji,
        tagline: body.tagline,
        fitur: Array.isArray(body.fitur) ? body.fitur : undefined,
        accent: body.accent,
        tint: body.tint,
        url: body.url,
        urutan: body.urutan,
      },
    })
    return NextResponse.json(app)
  } catch {
    return NextResponse.json({ error: 'App tidak ditemukan' }, { status: 404 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const idNum = Number(id)
  if (!Number.isInteger(idNum)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 })

  try {
    // Soft delete — riwayat konten yang sudah dibuat tetap tersimpan & bisa
    // dilihat, cuma app-nya tidak muncul lagi di daftar aktif.
    await prisma.promoApp.update({ where: { id: idNum }, data: { aktif: false } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'App tidak ditemukan' }, { status: 404 })
  }
}
