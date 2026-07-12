import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import { createWriteStream } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import Busboy from 'busboy'
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

// POST — upload musik via busboy stream (bypass 10MB limit)
export async function POST(req: NextRequest) {
  if (!await cekAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Content-type harus multipart/form-data' }, { status: 400 })
    }

    const dir = await pastikanMusicDir()
    const id = randomUUID()

    // Parse multipart via busboy stream
    const result = await new Promise<{ filePath: string; nama: string; mimeType: string; size: number }>((resolve, reject) => {
      const bb = Busboy({
        headers: { 'content-type': contentType },
        limits: { fileSize: MAX_MUSIC_BYTES },
      })

      let nama = ''
      let filePath = ''
      let mimeType = ''
      let size = 0
      let fileSaved = false

      bb.on('field', (name, val) => {
        if (name === 'nama') nama = val
      })

      bb.on('file', (fieldname, fileStream, info) => {
        mimeType = info.mimeType
        const ext = path.extname(info.filename) || (isVideoFile(mimeType) ? '.mp4' : '.mp3')
        filePath = path.join(dir, `${id}-input${ext}`)
        const writeStream = createWriteStream(filePath)

        fileStream.on('data', (chunk: Buffer) => { size += chunk.length })
        fileStream.on('limit', () => reject(new Error('File terlalu besar, maksimal 50MB')))
        fileStream.pipe(writeStream)
        writeStream.on('finish', () => { fileSaved = true })
        writeStream.on('error', reject)
      })

      bb.on('finish', () => {
        if (!fileSaved) reject(new Error('Tidak ada file yang diupload'))
        else resolve({ filePath, nama, mimeType, size })
      })
      bb.on('error', reject)

      // Pipe request body ke busboy
      const nodeReq = Readable.fromWeb(req.body as any)
      nodeReq.pipe(bb)
    })

    const { filePath: inputPath, nama: namaInput, mimeType, size } = result

    if (!TIPE_MUSIK_DIIZINKAN.includes(mimeType)) {
      await fs.unlink(inputPath).catch(() => {})
      return NextResponse.json({ error: 'Format tidak didukung. Gunakan MP3, WAV, AAC, M4A, atau video MP4/MOV.' }, { status: 400 })
    }

    const audioPath = path.join(dir, `${id}.mp3`)
    const durasi = await getDurasi(inputPath).catch(() => null)

    if (isVideoFile(mimeType)) {
      await ekstrakAudio(inputPath, audioPath)
      await fs.unlink(inputPath).catch(() => {})
    } else {
      await fs.rename(inputPath, audioPath)
    }

    const stat = await fs.stat(audioPath)
    const namaFinal = namaInput || `Track ${new Date().toLocaleDateString('id-ID')}`

    const track = await prisma.musicTrack.create({
      data: { nama: namaFinal, durasi, path: audioPath, ukuran: stat.size },
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
      '-vn',              // hapus video stream
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

