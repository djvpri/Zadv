// Direktori penyimpanan video — arahkan ke Railway Volume via env var
// VIDEO_STORAGE_DIR (mis. /data/videos). Kalau belum di-set (dev lokal),
// fallback ke folder lokal supaya tidak error saat development.
import path from 'path'
import { promises as fs } from 'fs'

export function getVideoDir(): string {
  return process.env.VIDEO_STORAGE_DIR || path.join(process.cwd(), '.tmp-videos')
}

export async function pastikanVideoDir(): Promise<string> {
  const dir = getVideoDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024 // 200MB
export const TIPE_VIDEO_DIIZINKAN = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm']
