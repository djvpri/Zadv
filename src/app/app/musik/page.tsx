'use client'
import { useState, useEffect, useRef } from 'react'

interface MusicTrack {
  id: number
  nama: string
  durasi: number | null
  ukuran: number | null
  createdAt: string
}

function formatDurasi(detik: number | null) {
  if (!detik) return '-'
  const m = Math.floor(detik / 60)
  const s = Math.floor(detik % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatUkuran(bytes: number | null) {
  if (!bytes) return '-'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function HalamanMusik() {
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [nama, setNama] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState('')
  const [hapusId, setHapusId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/music')
      .then(r => r.json())
      .then(d => setTracks(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleUpload = async () => {
    if (!file) { setError('Pilih file terlebih dahulu'); return }
    setUploading(true)
    setError('')
    setSukses('')

    const form = new FormData()
    form.append('file', file)
    if (nama.trim()) form.append('nama', nama.trim())

    try {
      const res = await fetch('/api/music', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload gagal')
      setSukses(`"${data.nama}" berhasil diupload!`)
      setFile(null)
      setNama('')
      if (inputRef.current) inputRef.current.value = ''
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleHapus = async (id: number) => {
    setHapusId(id)
    try {
      await fetch(`/api/music/${id}`, { method: 'DELETE' })
      load()
    } finally {
      setHapusId(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">🎵 Kelola Musik</h1>
      <p className="text-sm text-[#8A8378] mb-8">
        Upload audio atau video sebagai backsound. Saat proses video, pilih musik yang ingin dipakai sebagai latar belakang.
      </p>

      {/* Upload Form */}
      <div className="bg-[#1A1814] border border-[#2A2520] rounded-2xl p-5 mb-8">
        <h2 className="font-semibold mb-4 text-sm">Upload Musik Baru</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#8A8378] mb-1 block">File (MP3, WAV, AAC, M4A, atau Video MP4/MOV)</label>
            <input
              ref={inputRef}
              type="file"
              accept="audio/*,video/mp4,video/quicktime,video/webm"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-[#8A8378] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-[#2A2520] file:text-[#D4C5A9] hover:file:bg-[#3A3530] cursor-pointer"
            />
            {file && (
              <p className="text-xs text-[#8A8378] mt-1">
                {file.name} · {formatUkuran(file.size)}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-[#8A8378] mb-1 block">Nama (opsional)</label>
            <input
              type="text"
              value={nama}
              onChange={e => setNama(e.target.value)}
              placeholder="Contoh: Lo-fi Chill, Upbeat Promo..."
              className="w-full bg-[#0F0E0C] border border-[#2A2520] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#8B7355]"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {sukses && <p className="text-xs text-green-400">{sukses}</p>}

          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className="w-full py-2 rounded-xl text-sm font-medium bg-[#8B7355] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#7A6345] transition-colors"
          >
            {uploading ? '⏳ Mengupload...' : '⬆ Upload Musik'}
          </button>
        </div>
      </div>

      {/* Daftar Musik */}
      <h2 className="font-semibold mb-3 text-sm">Koleksi Musik ({tracks.length})</h2>
      {loading ? (
        <p className="text-sm text-[#8A8378]">Memuat...</p>
      ) : tracks.length === 0 ? (
        <p className="text-sm text-[#8A8378]">Belum ada musik. Upload dulu di atas.</p>
      ) : (
        <div className="space-y-2">
          {tracks.map(t => (
            <div key={t.id} className="flex items-center justify-between bg-[#1A1814] border border-[#2A2520] rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">🎵</span>
                <div>
                  <p className="text-sm font-medium">{t.nama}</p>
                  <p className="text-xs text-[#8A8378]">
                    {formatDurasi(t.durasi)} · {formatUkuran(t.ukuran)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleHapus(t.id)}
                disabled={hapusId === t.id}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 px-2 py-1"
              >
                {hapusId === t.id ? '...' : 'Hapus'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
