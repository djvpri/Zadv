import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  const data = await prisma.waKontak.findMany({
    orderBy: [{ grup: 'asc' }, { nama: 'asc' }],
    select: { id: true, nama: true, nomor: true, grup: true },
  })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { nama, nomor, grup } = await req.json()
  if (!nama?.trim() || !nomor?.trim()) {
    return NextResponse.json({ error: 'nama dan nomor wajib diisi' }, { status: 400 })
  }
  const kontak = await prisma.waKontak.create({
    data: { nama: nama.trim(), nomor: nomor.trim(), grup: grup?.trim() || null },
  })
  return NextResponse.json(kontak, { status: 201 })
}
