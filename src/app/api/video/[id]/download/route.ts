import { NextResponse } from 'next/server'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import prisma from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const idNum = Number(id)
  if (!Number.isInteger(idNum)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 })

  const job = await prisma.videoJob.findUnique({ where: { id: idNum } })
  if (!job || job.status !== 'done' || !job.outputPath) {
    return NextResponse.json({ error: 'Video belum siap' }, { status: 404 })
  }

  try {
    const info = await stat(job.outputPath)
    const stream = Readable.toWeb(createReadStream(job.outputPath)) as ReadableStream
    return new Response(stream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(info.size),
        'Content-Disposition': `attachment; filename="promo-video-${job.id}.mp4"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'File hasil tidak ditemukan di server' }, { status: 404 })
  }
}
