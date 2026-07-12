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

// GET — list semua musik
export async function GET(req: NextRequest) {
  if (!await cekAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tracks = await prisma.musicTrack.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(tracks)
}

// POST — upload musik sebagai raw binary body (bypass multipart parsing limit)
// Metadata dikirim via query params: ?nama=...&type=audio/mpeg&filename=...
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
    const id = randomUUID()
    const ext = path.extname(filename) || (isVideoFile(mimeType) ? '.mp4' : '.mp3')
    const inputPath = path.join(dir, `${id}-input${ext}`)

    // Stream body langsung ke disk — tidak ada buffering di memori
    const nodeReq = Readable.fromWeb(req.body as any)
    await pipeline(nodeReq, createWriteStream(inputPath))

    // Cek ukuran setelah simpan
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
    const audioPath = path.join(dir, `${id}.mp3`)

    if (isVideoFile(mimeType)) {
      await ekstrakAudio(inputPath, audioPath)
      await fs.unlink(inputPath).catch(() => {})
    } else {
      await fs.rename(inputPath, audioPath)
    }

    const audioStat = await fs.stat(audioPath)
    const namaFinal = namaInput || `Track ${new Date().toLocaleDateString('id-ID')}`

    const track = await prisma.musicTrack.create({
      data: { nama: namaFinal, durasi, path: audioPath, ukuran: audioStat.size },
    })

    return NextResponse.json(track)
  } catch (e: any) {
    console.error('[musik upload error]', e)
    return NextResponse.json({ error: e.message || 'Upload gagal' }, { status: 500 })
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
      '-i', inputPath,
      '-vn',
      '-acodec', 'mp3',
      '-ab', '192k',
      '-y', outputPath,
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
