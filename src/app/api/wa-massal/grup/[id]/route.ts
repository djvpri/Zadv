import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  if (isNaN(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 })
  await prisma.waGrupKontak.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
