import path from 'path'
import { promises as fs } from 'fs'

export function getWaMediaDir(): string {
  return process.env.WA_MEDIA_DIR || '/data/wa-media'
}

export async function pastikanWaMediaDir(): Promise<string> {
  const dir = getWaMediaDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export const MAX_WA_MEDIA_BYTES = 16 * 1024 * 1024 // 16MB (WA limit)

export const TIPE_DIIZINKAN: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
}
