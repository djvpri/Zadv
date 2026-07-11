import path from 'path'
import { promises as fs } from 'fs'

export function getMusicDir(): string {
  const base = process.env.VIDEO_STORAGE_DIR || path.join(process.cwd(), '.tmp-videos')
  return path.join(path.dirname(base), 'music')
}

export async function pastikanMusicDir(): Promise<string> {
  const dir = getMusicDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export const MAX_MUSIC_BYTES = 50 * 1024 * 1024 // 50MB

export const TIPE_MUSIK_DIIZINKAN = [
  // Audio
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac',
  'audio/flac', 'audio/x-m4a', 'audio/mp4',
  // Video (akan diekstrak audionya)
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
]

export function isVideoFile(mimeType: string): boolean {
  return mimeType.startsWith('video/')
}
