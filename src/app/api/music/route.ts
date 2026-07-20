import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { Readable } from 'stream'
import { jwtVerify } from 'jose'
import prisma from '@/lib/db'
import {
  pastikanMusicDir,
  MAX_MUSIC_BYTES, TIPE_MUSIK_DIIZINKAN, isVideoFile,
} from '@/lib/music-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

// GET — list semua musik
export async function GET(req: NextRequest) {
  if (!await cekAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tracks = await prisma.musicTrack.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(tracks)
}

// Proses file musik yang sudah ada di disk: cek ukuran, ekstrak audio jika video,
// simpan ke DB, kembalikan track yang dibuat.
async function prosesFileMusik(
  inputPath: string,
  dir: string,
  fileId: string,
  mimeType: string,
  filename: string,
  namaInput: string,
): Promise<NextResponse> {
  const inputStat = await fs.stat(inputPath)
  if (inputStat.size > MAX_MUSIC_BYTES) {
    await fs.unlink(inputPath).catch(() => {})
    return NextResponse.json({ error: 'File terlalu besar, maksimal 50MB' }, { status: 400 })
  }
  if (inputStat.size === 0) {
    await fs.unlink(inputPath).catch(() => {})
    return NextResponse.json({ error: 'File kosong' }, { status: 400 })
  }

  const durasi = await getDurasi(inputPath).catch(() => null)
  const audioPath = path.join(dir, `${fileId}.mp3`)

  if (isVideoFile(mimeType)) {
    await ekstrakAudio(inputPath, audioPath)
    await fs.unlink(inputPath).catch(() => {})
  } else {
    await fs.rename(inputPath, audioPath)
  }

  const audioStat = await fs.stat(audioPath)
  const namaFinal = namaInput || path.basename(filename, path.extname(filename))

  const track = await prisma.musicTrack.create({
    data: { nama: namaFinal, durasi, path: audioPath, ukuran: audioStat.size },
  })

  return NextResponse.json(track)
}

// POST — mendukung dua mode upload:
// 1. Single (file kecil): body = raw binary, metadata via query params
// 2. Chunked (file besar): header X-Upload-Id / X-Chunk-Index / X-Total-Chunks
export async function POST(req: NextRequest) {
  if (!await cekAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    if (!req.body) return NextResponse.json({ error: 'Body kosong' }, { status: 400 })

    const params = req.nextUrl.searchParams
    const namaInput = params.get('nama') || ''
    const mimeType = params.get('type') || 'audio/mpeg'
    const filename = params.get('filename') || 'track'

    if (!TIPE_MUSIK_DIIZINKAN.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Format tidak didukung. Gunakan MP3, WAV, AAC, M4A, atau video MP4/MOV.' },
        { status: 400 }
      )
    }

    const dir = await pastikanMusicDir()

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

      const chunkDir = path.join(dir, `chunks-${uploadId}`)
      await fs.mkdir(chunkDir, { recursive: true })

      const chunkPath = path.join(chunkDir, `chunk-${String(chunkIndex).padStart(5, '0')}`)
      const nodeReq = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0])
      await pipeline(nodeReq, createWriteStream(chunkPath))

      // Bukan chunk terakhir → tunggu chunk berikutnya
      if (chunkIndex < totalChunks - 1) {
        return NextResponse.json({ received: chunkIndex, complete: false })
      }

      // Chunk terakhir → verifikasi semua ada lalu gabungkan
      const chunkFiles = (await fs.readdir(chunkDir)).sort()
      for (let i = 0; i < totalChunks; i++) {
        if (!chunkFiles.includes(`chunk-${String(i).padStart(5, '0')}`)) {
          return NextResponse.json({ error: `Chunk ${i} hilang — coba upload ulang` }, { status: 400 })
        }
      }

      const ext = path.extname(filename) || (isVideoFile(mimeType) ? '.mp4' : '.mp3')
      const inputPath = path.join(dir, `${uploadId}-input${ext}`)

      for (let i = 0; i < totalChunks; i++) {
        const cp = path.join(chunkDir, `chunk-${String(i).padStart(5, '0')}`)
        const data = await fs.readFile(cp)
        await fs.appendFile(inputPath, data)
        await fs.unlink(cp)
      }
      await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {})

      return prosesFileMusik(inputPath, dir, uploadId, mimeType, filename, namaInput)
    }

    // ── Mode normal (single upload) ──
    const id = randomUUID()
    const ext = path.extname(filename) || (isVideoFile(mimeType) ? '.mp4' : '.mp3')
    const inputPath = path.join(dir, `${id}-input${ext}`)

    const nodeReq = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0])
    await pipeline(nodeReq, createWriteStream(inputPath))

    return prosesFileMusik(inputPath, dir, id, mimeType, filename, namaInput)

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[musik upload error]', msg)
    return NextResponse.json({ error: msg || 'Upload gagal' }, { status: 500 })
  }
}

function getDurasi(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ])
    let out = ''
    proc.stdout.on('data', (d) => { out += d.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      const detik = parseFloat(out.trim())
      if (code === 0 && !isNaN(detik)) resolve(detik)
      else reject(new Error('Gagal membaca durasi'))
    })
  })
}

function ekstrakAudio(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-i', inputPath, '-vn', '-acodec', 'mp3', '-ab', '192k', '-y', outputPath,
    ])
    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg ekstrak audio gagal: ${stderr.slice(-500)}`))
    })
  })
}
