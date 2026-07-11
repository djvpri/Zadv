import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import prisma from '@/lib/db'
import {
  getMusicDir, pastikanMusicDir,
  MAX_MUSIC_BYTES, TIPE_MUSIK_DIIZINKAN, isVideoFile,
} from '@/lib/music-storage'

// GET — list semua musik
export async function GET() {
  const tracks = await prisma.musicTrack.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(tracks)
}

// POST — upload musik baru
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const nama = (formData.get('nama') as string) || ''

    if (!file) return NextResponse.json({ error: 'File wajib diupload' }, { status: 400 })
    if (!TIPE_MUSIK_DIIZINKAN.includes(file.type)) {
      return NextResponse.json({ error: 'Format tidak didukung. Gunakan MP3, WAV, AAC, M4A, atau video MP4/MOV/WEBM.' }, { status: 400 })
    }
    if (file.size > MAX_MUSIC_BYTES) {
      return NextResponse.json({ error: 'File terlalu besar, maksimal 50MB' }, { status: 400 })
    }

    const dir = await pastikanMusicDir()
    const id = randomUUID()
    const ext = isVideoFile(file.type) ? path.extname(file.name) || '.mp4' : path.extname(file.name) || '.mp3'
    const inputPath = path.join(dir, `${id}-input${ext}`)
    const audioPath = path.join(dir, `${id}.mp3`)

    const buf = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(inputPath, buf)

    const durasi = await getDurasi(inputPath).catch(() => null)

    if (isVideoFile(file.type)) {
      await ekstrakAudio(inputPath, audioPath)
      await fs.unlink(inputPath).catch(() => {})
    } else {
      await fs.rename(inputPath, audioPath)
    }

    const stat = await fs.stat(audioPath)
    const namaFinal = nama || file.name.replace(/\.[^.]+$/, '')

    const track = await prisma.musicTrack.create({
      data: {
        nama: namaFinal,
        durasi,
        path: audioPath,
        ukuran: stat.size,
      },
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
