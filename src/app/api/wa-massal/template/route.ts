import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  const data = await prisma.waTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, judul: true, teks: true, mediaUrl: true, mediaFilename: true, mediaMime: true },
  })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { judul, teks, mediaUrl, mediaFilename, mediaMime } = await req.json()
  if (!judul || !teks) {
    return NextResponse.json({ error: 'judul dan teks wajib diisi' }, { status: 400 })
  }
  const tmpl = await prisma.waTemplate.create({
    data: { judul, teks, mediaUrl: mediaUrl || null, mediaFilename: mediaFilename || null, mediaMime: mediaMime || null },
  })
  return NextResponse.json(tmpl, { status: 201 })
}
