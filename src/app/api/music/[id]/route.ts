import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import { jwtVerify } from 'jose'
import prisma from '@/lib/db'

async function cekAuth(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get('zadv_session')?.value
  const secret = process.env.JWT_SECRET
  if (!token || !secret) return false
  try {
    await jwtVerify(token, new TextEncoder().encode(secret))
    return true
  } catch { return false }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await cekAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID tidak valid' }, { status: 400 })

  const { nama } = await req.json()
  if (!nama?.trim()) return NextResponse.json({ error: 'Nama tidak boleh kosong' }, { status: 400 })

  const track = await prisma.musicTrack.update({
    where: { id },
    data: { nama: nama.trim() },
  })
  return NextResponse.json(track)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await cekAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID tidak valid' }, { status: 400 })

  const track = await prisma.musicTrack.findUnique({ where: { id } })
  if (!track) return NextResponse.json({ error: 'Track tidak ditemukan' }, { status: 404 })

  await fs.unlink(track.path).catch(() => {})
  await prisma.musicTrack.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
