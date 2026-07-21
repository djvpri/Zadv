import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  const data = await prisma.waBlacklist.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { nomor, alasan } = await req.json()
  if (!nomor?.trim()) return NextResponse.json({ error: 'nomor wajib diisi' }, { status: 400 })
  const item = await prisma.waBlacklist.upsert({
    where: { nomor: nomor.trim() },
    update: { alasan: alasan?.trim() || null },
    create: { nomor: nomor.trim(), alasan: alasan?.trim() || null },
  })
  return NextResponse.json(item, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { nomor } = await req.json()
  await prisma.waBlacklist.delete({ where: { nomor } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
