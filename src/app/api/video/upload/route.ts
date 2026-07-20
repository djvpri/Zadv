import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { randomUUID } from 'crypto'
import { createWriteStream } from 'fs'
import { promises as fs } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { jwtVerify } from 'jose'
import prisma from '@/lib/db'
import { pastikanVideoDir, MAX_UPLOAD_BYTES, TIPE_VIDEO_DIIZINKAN } from '@/lib/video-storage'
import { prosesVideo } from '@/lib/video-processing'

export const runtime = 'nodejs'

async function cekAuth(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get('zadv_session')?.value
  const secret = process.env.JWT_SECRET
  if (!token || !secret) return false
  try {
    await jwtVerify(token, new TextEncoder().encode(secret))
    return true
  } catch { return false }
}

async function prosesDiBackground(
  jobId: number, inputPath: string, caption: string, videoDir: string,
  musicPath?: string | null, muteAsli?: boolean, fadeOut?: boolean,
  loopMusik?: boolean, mulaiDetik?: number,
  styleUkuran?: string, stylePosisi?: string, styleLatar?: string, styleWarna?: string
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

async function simpanBodyKeDisk(body: ReadableStream, destPath: string) {
  const ws = createWriteStream(destPath)
  const nodeStream = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])
  await pipeline(nodeStream, ws)
}

async function buatJobDanProses(
  inputPath: string,
  dir: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g: (key: string, def?: string) => string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta: Record<string, any>,
  boolMeta: (key: string, trueVal?: string) => boolean,
): Promise<NextResponse> {
  const stat = await fs.stat(inputPath)
  if (stat.size === 0) {
    await fs.unlink(inputPath).catch(() => {})
    return NextResponse.json({ error: 'File kosong — tidak ada data yang diterima' }, { status: 400 })
  }
  if (stat.size > MAX_UPLOAD_BYTES) {
    await fs.unlink(inputPath).catch(() => {})
    return NextResponse.json(
      { error: `File terlalu besar (${Math.round(stat.size / 1024 / 1024)}MB) — maksimal ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` },
      { status: 400 }
    )
  }

  const expectedSize = g('fileSize') ? Number(g('fileSize')) : null
  if (expectedSize && Math.abs(stat.size - expectedSize) > 1024) {
    await fs.unlink(inputPath).catch(() => {})
    return NextResponse.json({
      error: `Upload tidak lengkap — diterima ${(stat.size / 1024 / 1024).toFixed(1)}MB dari ${(expectedSize / 1024 / 1024).toFixed(1)}MB. Coba lagi.`,
    }, { status: 400 })
  }

  const script = g('script')
  if (!script.trim()) {
    await fs.unlink(inputPath).catch(() => {})
    return NextResponse.json({ error: 'Script tidak boleh kosong' }, { status: 400 })
  }

  const mimeType = g('type', 'video/mp4')
  if (!TIPE_VIDEO_DIIZINKAN.includes(mimeType)) {
    await fs.unlink(inputPath).catch(() => {})
    return NextResponse.json(
      { error: `Format tidak didukung (${mimeType}) — pakai MP4, MOV, WebM, atau MKV` },
      { status: 400 }
    )
  }

  const appIdRaw = g('appId')
  let appId: number | null = null
  if (appIdRaw) { const n = Number(appIdRaw); if (Number.isInteger(n)) appId = n }

  let musicTrackId: number | null = null
  let musicPath: string | null = null
  const mtStr = g('musicTrackId')
  if (mtStr) {
    const n = Number(mtStr)
    if (Number.isInteger(n) && n > 0) {
      const track = await prisma.musicTrack.findUnique({ where: { id: n } })
      if (track) { musicTrackId = track.id; musicPath = track.path }
    }
  }

  const job = await prisma.videoJob.create({
    data: { appId, caption: script, inputPath, status: 'pending', musicTrackId },
  })

  prosesDiBackground(
    job.id, inputPath, script, dir, musicPath,
    boolMeta('muteAsli'),
    boolMeta('fadeOut'),
    meta['noLoop'] != null ? !meta['noLoop'] : true,
    g('mulaiDetik') ? Number(g('mulaiDetik')) : 0,
    g('style_ukuran', 'sedang'),
    g('style_posisi', 'bawah'),
    g('style_latar', 'samar'),
    g('style_warna', 'putih'),
  ).catch(e => console.error('prosesDiBackground gagal:', e))

  return NextResponse.json({ id: job.id, status: job.status })
}

// POST — mendukung dua mode:
// 1. Single upload (file kecil ≤4MB): body = raw binary, metadata via X-Video-Metadata header
// 2. Chunked upload (file besar): tiap chunk punya header X-Upload-Id, X-Chunk-Index, X-Total-Chunks
//    Server mengumpulkan chunk lalu merakit otomatis di chunk terakhir.
export async function POST(req: NextRequest) {
  if (!await cekAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    if (!req.body) return NextResponse.json({ error: 'Body kosong — file tidak terkirim' }, { status: 400 })

    // Baca metadata dari header JSON (prioritas) atau URL params (fallback)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let meta: Record<string, any> = {}
    const metaHeader = req.headers.get('x-video-metadata')
    if (metaHeader) {
      try { meta = JSON.parse(metaHeader) } catch { /* pakai fallback */ }
    }
    const qp = req.nextUrl.searchParams
    const g = (key: string, def = '') => (meta[key] != null ? String(meta[key]) : qp.get(key) ?? def)
    const boolMeta = (key: string, trueVal = '1') =>
      meta[key] != null ? !!meta[key] : qp.get(key) === trueVal

    const dir = await pastikanVideoDir()

    // Cek apakah ini chunked upload
    const uploadId = req.headers.get('x-upload-id')
    const chunkIndexStr = req.headers.get('x-chunk-index')
    const totalChunksStr = req.headers.get('x-total-chunks')

    if (uploadId && chunkIndexStr !== null && totalChunksStr !== null) {
      // ── Mode chunked upload ──
      const chunkIndex = Number(chunkIndexStr)
      const totalChunks = Number(totalChunksStr)
      if (isNaN(chunkIndex) || isNaN(totalChunks) || chunkIndex < 0 || chunkIndex >= totalChunks) {
        return NextResponse.json({ error: 'Header chunk tidak valid' }, { status: 400 })
      }

      // Simpan chunk ke folder sementara
      const chunkDir = path.join(dir, `chunks-${uploadId}`)
      await fs.mkdir(chunkDir, { recursive: true })
      const chunkPath = path.join(chunkDir, `chunk-${String(chunkIndex).padStart(5, '0')}`)
      await simpanBodyKeDisk(req.body, chunkPath)

      // Bukan chunk terakhir → konfirmasi dan tunggu chunk berikutnya
      if (chunkIndex < totalChunks - 1) {
        return NextResponse.json({ received: chunkIndex, complete: false })
      }

      // Chunk terakhir → verifikasi semua chunk ada lalu gabungkan
      const chunkFiles = (await fs.readdir(chunkDir)).sort()
      for (let i = 0; i < totalChunks; i++) {
        if (!chunkFiles.includes(`chunk-${String(i).padStart(5, '0')}`)) {
          return NextResponse.json({ error: `Chunk ${i} hilang — coba upload ulang` }, { status: 400 })
        }
      }

      const filename = g('filename', 'video.mp4')
      const ext = path.extname(filename) || '.mp4'
      const inputPath = path.join(dir, `input-${uploadId}${ext}`)

      // Gabungkan chunk secara urutan
      for (let i = 0; i < totalChunks; i++) {
        const cp = path.join(chunkDir, `chunk-${String(i).padStart(5, '0')}`)
        const data = await fs.readFile(cp)
        await fs.appendFile(inputPath, data)
        await fs.unlink(cp)
      }
      await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {})

      return buatJobDanProses(inputPath, dir, g, meta, boolMeta)
    }

    // ── Mode normal (single upload) ──
    const filename = g('filename', 'video.mp4')
    const ext = path.extname(filename) || '.mp4'
    const inputPath = path.join(dir, `input-${randomUUID()}${ext}`)
    await simpanBodyKeDisk(req.body, inputPath)

    return buatJobDanProses(inputPath, dir, g, meta, boolMeta)

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[video/upload] Error:', msg)
    return NextResponse.json({ error: `Upload gagal: ${msg}` }, { status: 500 })
  }
}
