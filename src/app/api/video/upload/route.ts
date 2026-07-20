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

// POST — file video dikirim sebagai raw binary body (bukan multipart).
// Metadata dikirim via header X-Video-Metadata (JSON) — lebih andal dari URL params
// karena tidak ada batas panjang URL dan tidak terpengaruh cache proxy.
// URL params tetap diterima sebagai fallback.
export async function POST(req: NextRequest) {
  if (!await cekAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    if (!req.body) {
      return NextResponse.json({ error: 'Body kosong — file tidak terkirim' }, { status: 400 })
    }

    // Baca metadata: prioritaskan header JSON, fallback ke URL params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let meta: Record<string, any> = {}
    const metaHeader = req.headers.get('x-video-metadata')
    if (metaHeader) {
      try { meta = JSON.parse(metaHeader) } catch { /* pakai fallback */ }
    }
    const qp = req.nextUrl.searchParams
    const g = (key: string, def = '') => (meta[key] != null ? String(meta[key]) : qp.get(key) ?? def)

    const script = g('script')
    if (!script.trim()) {
      return NextResponse.json({ error: 'Script tidak boleh kosong' }, { status: 400 })
    }

    const filename = g('filename', 'video.mp4')
    const mimeType = g('type', 'video/mp4')

    if (!TIPE_VIDEO_DIIZINKAN.includes(mimeType)) {
      return NextResponse.json(
        { error: `Format tidak didukung (${mimeType}) — pakai MP4, MOV, WebM, atau MKV` },
        { status: 400 }
      )
    }

    const dir = await pastikanVideoDir()
    const ext = path.extname(filename) || '.mp4'
    const tempPath = path.join(dir, `input-${randomUUID()}${ext}`)

    // Stream file langsung ke disk tanpa load ke memory
    const ws = createWriteStream(tempPath)
    const nodeStream = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0])
    await pipeline(nodeStream, ws)

    const stat = await fs.stat(tempPath)
    if (stat.size === 0) {
      await fs.unlink(tempPath).catch(() => {})
      return NextResponse.json({ error: 'File kosong — tidak ada data yang diterima' }, { status: 400 })
    }
    if (stat.size > MAX_UPLOAD_BYTES) {
      await fs.unlink(tempPath).catch(() => {})
      return NextResponse.json(
        { error: `File terlalu besar (${Math.round(stat.size / 1024 / 1024)}MB) — maksimal ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` },
        { status: 400 }
      )
    }

    // Validasi upload tidak terpotong — bandingkan ukuran actual vs ukuran yang dilaporkan browser
    const expectedSize = g('fileSize') ? Number(g('fileSize')) : null
    if (expectedSize && stat.size !== expectedSize) {
      await fs.unlink(tempPath).catch(() => {})
      return NextResponse.json({
        error: `Upload tidak lengkap — diterima ${(stat.size / 1024 / 1024).toFixed(1)}MB dari ${(expectedSize / 1024 / 1024).toFixed(1)}MB. ` +
               `Coba lagi dengan koneksi yang lebih stabil.`,
      }, { status: 400 })
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
      data: { appId, caption: script, inputPath: tempPath, status: 'pending', musicTrackId },
    })

    const boolMeta = (key: string, trueVal = '1') =>
      meta[key] != null ? !!meta[key] : qp.get(key) === trueVal

    prosesDiBackground(
      job.id, tempPath, script, dir, musicPath,
      boolMeta('muteAsli'),
      boolMeta('fadeOut'),
      meta['noLoop'] != null ? !meta['noLoop'] : qp.get('noLoop') !== '1',
      g('mulaiDetik') ? Number(g('mulaiDetik')) : 0,
      g('style_ukuran', 'sedang'),
      g('style_posisi', 'bawah'),
      g('style_latar', 'samar'),
      g('style_warna', 'putih'),
    ).catch(e => console.error('prosesDiBackground gagal:', e))

    return NextResponse.json({ id: job.id, status: job.status })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[video/upload] Error:', msg)
    return NextResponse.json({ error: `Upload gagal: ${msg}` }, { status: 500 })
  }
}
