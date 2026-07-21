import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  const awalBulan = new Date()
  awalBulan.setDate(1)
  awalBulan.setHours(0, 0, 0, 0)

  const [bulanan, data] = await Promise.all([
    prisma.waRiwayat.count({
      where: { status: 'terkirim', sentAt: { gte: awalBulan } },
    }),
    prisma.waRiwayat.findMany({
      orderBy: { sentAt: 'desc' },
      take: 100,
      select: { id: true, nomor: true, pesan: true, mediaUrl: true, status: true, alasan: true, sentAt: true },
    }),
  ])

  return NextResponse.json({ bulanan, data })
}
