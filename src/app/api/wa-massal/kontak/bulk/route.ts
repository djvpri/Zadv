import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// PATCH { ids: number[], grup: string | null } — bulk assign grup
export async function PATCH(req: NextRequest) {
  const { ids, grup } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'ids wajib diisi' }, { status: 400 })

  await prisma.waKontak.updateMany({
    where: { id: { in: ids.map(Number) } },
    data: { grup: grup?.trim() || null },
  })
  return NextResponse.json({ ok: true, updated: ids.length })
}

// DELETE { ids: number[] } — bulk hapus kontak
export async function DELETE(req: NextRequest) {
  const { ids } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'ids wajib diisi' }, { status: 400 })

  await prisma.waKontak.deleteMany({ where: { id: { in: ids.map(Number) } } })
  return NextResponse.json({ ok: true, deleted: ids.length })
}
