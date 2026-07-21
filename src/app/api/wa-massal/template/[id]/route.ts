import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = parseInt(rawId)
  if (isNaN(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 })
  await prisma.waTemplate.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
