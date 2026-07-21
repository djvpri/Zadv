import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const data = await prisma.waGrupKontak.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, nama: true, nomor: true, createdAt: true },
  })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { nama, nomor } = await req.json()
  if (!nama || !Array.isArray(nomor) || nomor.length === 0) {
    return NextResponse.json({ error: 'nama dan nomor wajib diisi' }, { status: 400 })
  }
  const grup = await prisma.waGrupKontak.create({ data: { nama, nomor } })
  return NextResponse.json(grup, { status: 201 })
}
