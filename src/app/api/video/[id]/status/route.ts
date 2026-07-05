import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const idNum = Number(id)
  if (!Number.isInteger(idNum)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 })

  const job = await prisma.videoJob.findUnique({ where: { id: idNum } })
  if (!job) return NextResponse.json({ error: 'Job tidak ditemukan' }, { status: 404 })

  return NextResponse.json({
    id: job.id,
    status: job.status,
    errorMessage: job.errorMessage,
    durasiAsli: job.durasiAsli,
    siap: job.status === 'done',
  })
}
