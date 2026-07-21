import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  if (isNaN(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 })
  await prisma.waTemplate.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
