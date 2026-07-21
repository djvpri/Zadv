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
  const nomorArr: string[] = Array.isArray(nomor)
    ? nomor.map((n: string) => n.trim()).filter(Boolean)
    : [nomor?.trim()].filter(Boolean)

  if (!nama?.trim() || nomorArr.length === 0) {
    return NextResponse.json({ error: 'nama dan minimal 1 nomor wajib diisi' }, { status: 400 })
  }
  const duplikat = await prisma.waKontak.findFirst({ where: { nomor: { hasSome: nomorArr } }, select: { nama: true, nomor: true } })
  if (duplikat) {
    const nomorBentrok = nomorArr.find(n => duplikat.nomor.includes(n))
    return NextResponse.json({ error: `Nomor +${nomorBentrok} sudah ada di kontak "${duplikat.nama}"` }, { status: 409 })
  }
  const kontak = await prisma.waKontak.create({
    data: { nama: nama.trim(), nomor: nomorArr, grup: grup?.trim() || null },
  })
  return NextResponse.json(kontak, { status: 201 })
}
