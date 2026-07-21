import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = parseInt(rawId)
  if (isNaN(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 })
  const { nama, nomor, grup } = await req.json()
  const nomorArr: string[] = Array.isArray(nomor)
    ? nomor.map((n: string) => n.trim()).filter(Boolean)
    : [nomor?.trim()].filter(Boolean)
  if (!nama?.trim() || nomorArr.length === 0)
    return NextResponse.json({ error: 'nama dan minimal 1 nomor wajib diisi' }, { status: 400 })
  const kontak = await prisma.waKontak.update({
    where: { id },
    data: { nama: nama.trim(), nomor: nomorArr, grup: grup?.trim() || null },
  })
  return NextResponse.json(kontak)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = parseInt(rawId)
  if (isNaN(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 })
  await prisma.waKontak.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
