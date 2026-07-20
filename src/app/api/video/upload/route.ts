import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { randomUUID } from 'crypto'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { jwtVerify } from 'jose'
import busboy from 'busboy'
import prisma from '@/lib/db'
import { pastikanVideoDir, MAX_UPLOAD_BYTES, TIPE_VIDEO_DIIZINKAN } from '@/lib/video-storage'
import { prosesVideo } from '@/lib/video-processing'

export const runtime = 'nodejs'

// Auth manual — route ini di-skip middleware agar upload file besar tidak
// melewati Edge runtime yang punya batas body kecil.
async function cekAuth(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get('zadv_session')?.value
  const secret = process.env.JWT_SECRET
  if (!token || !secret) return false
  try {
    await jwtVerify(token, new TextEncoder().encode(secret))
    return true
  } catch {
    return false
  }
}

async function prosesDiBackground(
  jobId: number,
  inputPath: string,
  caption: string,
  videoDir: string,
  musicPath?: string | null,
  muteAsli?: boolean,
  fadeOut?: boolean,
  loopMusik?: boolean,
  mulaiDetik?: number,
  styleUkuran?: string,
  stylePosisi?: string,
  styleLatar?: string,
  styleWarna?: string
) {
  try {
    await prisma.videoJob.update({ where: { id: jobId }, data: { status: 'processing' } })
    const outputPath = path.join(videoDir, `output-${jobId}.mp4`)
    const hasil = await prosesVideo(inputPath, caption, outputPath, musicPath, muteAsli, fadeOut, loopMusik, mulaiDetik, styleUkuran, stylePosisi, styleLatar, styleWarna)
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

interface ParsedForm {
  fields: Record<string, string>
  file: { path: string; mimetype: string; size: number; name: string } | null
}

function parseMultipart(req: Request): Promise<ParsedForm> {
  return new Promise((resolve, reject) => {
    if (!req.body) { reject(new Error('Request body kosong')); return }

    const contentType = req.headers.get('content-type') || ''
    const bb = busboy({ headers: { 'content-type': contentType }, limits: { fileSize: MAX_UPLOAD_BYTES } })

    const fields: Record<string, string> = {}
    let fileResult: ParsedForm['file'] = null
    const filePromises: Promise<void>[] = []

    bb.on('field', (name: string, val: string) => { fields[name] = val })

    bb.on('file', (_field: string, stream: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
      let size = 0
      const p = (async () => {
        const dir = await pastikanVideoDir()
        const ext = path.extname(info.filename) || '.mp4'
        const tempPath = path.join(dir, `input-${randomUUID()}${ext}`)
        const ws = createWriteStream(tempPath)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(stream as any).on('data', (chunk: Buffer) => { size += chunk.length })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await pipeline(stream as any, ws)
        fileResult = { path: tempPath, mimetype: info.mimeType, size, name: info.filename }
      })()
      filePromises.push(p)
      p.catch(reject)
    })

    bb.on('finish', () => {
      Promise.all(filePromises).then(() => resolve({ fields, file: fileResult })).catch(reject)
    })

    bb.on('error', (err: Error) => reject(err))

    // Pipe Web ReadableStream → Node.js Readable → busboy
    const nodeStream = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0])
    nodeStream.on('error', reject)
    nodeStream.pipe(bb)
  })
}

export async function POST(req: NextRequest) {
  if (!await cekAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { fields, file } = await parseMultipart(req)

    if (!file) return NextResponse.json({ error: 'File video wajib diisi' }, { status: 400 })

    const caption = fields.script || fields.caption || ''
    if (!caption.trim()) return NextResponse.json({ error: 'Teks caption wajib diisi' }, { status: 400 })

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `Video terlalu besar — maksimal ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` }, { status: 400 })
    }
    if (!TIPE_VIDEO_DIIZINKAN.includes(file.mimetype)) {
      return NextResponse.json({ error: 'Format tidak didukung — pakai MP4, MOV, WebM, atau MKV' }, { status: 400 })
    }

    const appIdRaw = fields.appId
    let appId: number | null = null
    if (appIdRaw) { const n = Number(appIdRaw); if (Number.isInteger(n)) appId = n }

    let musicTrackId: number | null = null
    let musicPath: string | null = null
    if (fields.musicTrackId) {
      const n = Number(fields.musicTrackId)
      if (Number.isInteger(n) && n > 0) {
        const track = await prisma.musicTrack.findUnique({ where: { id: n } })
        if (track) { musicTrackId = track.id; musicPath = track.path }
      }
    }

    const videoDir = path.dirname(file.path)

    const job = await prisma.videoJob.create({
      data: { appId, caption, inputPath: file.path, status: 'pending', musicTrackId },
    })

    const styleUkuran  = fields.style_ukuran || 'sedang'
    const stylePosisi  = fields.style_posisi  || 'bawah'
    const styleLatar   = fields.style_latar   || 'samar'
    const styleWarna   = fields.style_warna   || 'putih'

    prosesDiBackground(
      job.id, file.path, caption, videoDir, musicPath,
      fields.muteAsli === '1', fields.fadeOut === '1', fields.noLoop !== '1',
      fields.mulaiDetik ? Number(fields.mulaiDetik) : 0,
      styleUkuran, stylePosisi, styleLatar, styleWarna
    ).catch((e) => { console.error('prosesDiBackground gagal:', e) })

    return NextResponse.json({ id: job.id, status: job.status })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[video/upload] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
