import { NextResponse } from 'next/server'
import path from 'path'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import prisma from '@/lib/db'
import { pastikanVideoDir, MAX_UPLOAD_BYTES, TIPE_VIDEO_DIIZINKAN } from '@/lib/video-storage'
import { prosesVideo } from '@/lib/video-processing'

export const runtime = 'nodejs'

// Proses video di background — TIDAK di-await oleh caller (fire-and-forget).
// Ini aman karena zpromo jalan sebagai server Node persisten di Railway
// (bukan serverless/edge yang mematikan proses setelah response terkirim).
async function prosesDiBackground(jobId: number, inputPath: string, caption: string, videoDir: string) {
  try {
    await prisma.videoJob.update({ where: { id: jobId }, data: { status: 'processing' } })
    const outputPath = path.join(videoDir, `output-${jobId}.mp4`)
    const hasil = await prosesVideo(inputPath, caption, outputPath)
    await prisma.videoJob.update({
      where: { id: jobId },
      data: { status: 'done', outputPath, durasiAsli: hasil.durasiAsli },
    })
  } catch (e) {
    console.error(`VideoJob ${jobId} gagal:`, e)
    await prisma.videoJob.update({
      where: { id: jobId },
      data: { status: 'error', errorMessage: e instanceof Error ? e.message : 'Gagal memproses video' },
    }).catch(() => {})
  }
}

export async function POST(req: Request) {
  const form = await req.formData()
  const file = form.get('file')
  const caption = form.get('caption')
  const appIdRaw = form.get('appId')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File video wajib diisi' }, { status: 400 })
  }
  if (typeof caption !== 'string' || !caption.trim()) {
    return NextResponse.json({ error: 'Teks caption wajib diisi' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `Video maksimal ${MAX_UPLOAD_BYTES / 1024 / 1024}MB` }, { status: 400 })
  }
  if (!TIPE_VIDEO_DIIZINKAN.includes(file.type)) {
    return NextResponse.json({ error: 'Format video tidak didukung (pakai MP4, MOV, WebM, atau MKV)' }, { status: 400 })
  }

  let appId: number | null = null
  if (appIdRaw && typeof appIdRaw === 'string') {
    const n = Number(appIdRaw)
    if (Number.isInteger(n)) appId = n
  }

  const videoDir = await pastikanVideoDir()
  const ext = path.extname(file.name) || '.mp4'
  const inputPath = path.join(videoDir, `input-${randomUUID()}${ext}`)
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(inputPath, buffer)

  const job = await prisma.videoJob.create({
    data: { appId, caption, inputPath, status: 'pending' },
  })

  // Sengaja tidak di-await — client polling status lewat endpoint terpisah.
  prosesDiBackground(job.id, inputPath, caption, videoDir).catch((e) => {
    console.error('prosesDiBackground gagal tak terduga:', e)
  })

  return NextResponse.json({ id: job.id, status: job.status })
}
