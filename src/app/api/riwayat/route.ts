import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  const riwayat = await prisma.kontenPromo.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { app: { select: { nama: true, emoji: true, accent: true } } },
  })
  return NextResponse.json(riwayat)
}
