'use client'
import { useState, useEffect, useRef } from 'react'

interface PromoApp {
  id: number
  nama: string
  emoji: string
  tagline: string
  accent: string
}

interface StatusJob {
  id: number
  status: 'pending' | 'processing' | 'done' | 'error'
  errorMessage?: string | null
  durasiAsli?: number | null
  siap: boolean
}

const LABEL_STATUS: Record<string, string> = {
  pending: 'Menunggu diproses...',
  processing: 'Memotong & menambahkan caption...',
  done: 'Selesai!',
  error: 'Gagal',
}

export default function VideoPage() {
  const [apps, setApps] = useState<PromoApp[]>([])
  const [appId, setAppId] = useState<number | null>(null)
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [job, setJob] = useState<StatusJob | null>(null)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch('/api/apps')
      .then((r) => r.json())
      .then((data: PromoApp[]) => {
        setApps(data)
        if (data.length > 0) {
          setAppId(data[0].id)
          setCaption(data[0].tagline)
        }
      })
  }, [])

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function pilihApp(id: number) {
    setAppId(id)
    const app = apps.find((a) => a.id === id)
    if (app) setCaption(app.tagline)
  }

  function mulaiPolling(jobId: number) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/video/${jobId}/status`)
      if (!res.ok) return
      const data: StatusJob = await res.json()
      setJob(data)
      if (data.status === 'done' || data.status === 'error') {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }, 3000)
  }

  async function upload() {
    if (!file || !appId || !caption.trim()) return
    setUploading(true)
    setError('')
    setJob(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('caption', caption)
      form.append('appId', String(appId))
      const res = await fetch('/api/video/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal upload')
      setJob({ id: data.id, status: 'pending', siap: false })
      mulaiPolling(data.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal upload video')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-lg">
      <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-1">VIDEO PROMOSI</p>
      <p className="text-[11.5px] text-[#8A8378] mb-5 leading-relaxed">
        Upload video (durasi berapa pun), otomatis dipotong jadi ~60 detik dengan
        mengambil sampel dari bagian depan-tengah-belakang (bukan cuma 1 menit
        pertama), lalu ditambahkan caption di atasnya.
      </p>

      <div className="rounded-lg bg-white/[0.03] border border-white/10 p-5 flex flex-col gap-4">
        <div>
          <p className="text-[11px] text-[#8A8378] mb-1.5">Untuk app</p>
          <div className="flex flex-wrap gap-1.5">
            {apps.map((app) => (
              <button
                key={app.id}
                onClick={() => pilihApp(app.id)}
                className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors ${
                  appId === app.id
                    ? 'bg-[#D8A23D] text-[#1C1917] border-[#D8A23D] font-medium'
                    : 'border-white/15 text-[#B3ACA1] hover:border-white/30'
                }`}
              >
                {app.emoji} {app.nama}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] text-[#8A8378] mb-1.5">Teks di video (boleh diubah)</p>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={2}
            className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-[13px] outline-none focus:border-[#D8A23D] resize-none"
          />
        </div>

        <div>
          <p className="text-[11px] text-[#8A8378] mb-1.5">File video (maks 200MB)</p>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-[12px] text-[#B3ACA1] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-[#CFC9BE] file:text-[12px]"
          />
        </div>

        <button
          onClick={upload}
          disabled={uploading || !file || !appId || !caption.trim()}
          className="py-2.5 rounded-md bg-[#D8A23D] text-[#1C1917] text-[13px] font-semibold hover:bg-[#E3B458] disabled:opacity-50 transition-colors"
        >
          {uploading ? 'Mengunggah...' : '🎬 Proses Video'}
        </button>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>

      {job && (
        <div className="mt-5 rounded-lg bg-white/[0.03] border border-white/10 p-5">
          <div className="flex items-center gap-2">
            {job.status !== 'done' && job.status !== 'error' && (
              <span className="w-3 h-3 rounded-full border-2 border-[#D8A23D] border-t-transparent animate-spin" />
            )}
            <p className="text-[13px] font-medium">{LABEL_STATUS[job.status]}</p>
          </div>
          {job.status === 'error' && (
            <p className="text-[11.5px] text-red-400 mt-2">{job.errorMessage}</p>
          )}
          {job.status === 'done' && (
            <a
              href={`/api/video/${job.id}/download`}
              download
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#D8A23D] text-[#1C1917] text-[12px] font-semibold hover:bg-[#E3B458] transition-colors"
            >
              ⬇️ Unduh Video
            </a>
          )}
          {(job.status === 'pending' || job.status === 'processing') && (
            <p className="text-[10.5px] text-[#6B6459] mt-2">
              Video sedang diproses di server — halaman ini otomatis memeriksa tiap 3 detik.
              Boleh ditinggal, tidak perlu ditunggu di sini.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
