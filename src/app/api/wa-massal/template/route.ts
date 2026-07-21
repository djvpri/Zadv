import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const data = await prisma.waTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, judul: true, teks: true, createdAt: true },
  })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { judul, teks } = await req.json()
  if (!judul || !teks) {
    return NextResponse.json({ error: 'judul dan teks wajib diisi' }, { status: 400 })
  }
  const tmpl = await prisma.waTemplate.create({ data: { judul, teks } })
  return NextResponse.json(tmpl, { status: 201 })
}
