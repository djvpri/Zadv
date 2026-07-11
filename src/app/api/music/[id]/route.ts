import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import prisma from '@/lib/db'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID tidak valid' }, { status: 400 })

  const track = await prisma.musicTrack.findUnique({ where: { id } })
  if (!track) return NextResponse.json({ error: 'Track tidak ditemukan' }, { status: 404 })

  // Hapus file dari volume
  await fs.unlink(track.path).catch(() => {})

  await prisma.musicTrack.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
