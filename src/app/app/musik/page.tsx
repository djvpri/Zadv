'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

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
  const [uploadInfo, setUploadInfo] = useState('')
  const [nama, setNama] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [sukses, setSukses] = useState('')
  const [hapusId, setHapusId] = useState<number | null>(null)
  const [renameId, setRenameId] = useState<number | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)

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
    setUploadInfo('')
    setError('')
    setSukses('')

    const qp = new URLSearchParams({ type: file.type, filename: file.name })
    if (nama.trim()) qp.set('nama', nama.trim())
    const url = `/api/music?${qp}`

    const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

    try {
      let data: { nama?: string; error?: string; id?: number }

      if (totalChunks <= 1) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file,
        })
        data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload gagal')
      } else {
        const uploadId = crypto.randomUUID()
        for (let i = 0; i < totalChunks; i++) {
          setUploadInfo(`Mengunggah bagian ${i + 1} dari ${totalChunks}...`)
          const start = i * CHUNK_SIZE
          const end = Math.min(start + CHUNK_SIZE, file.size)
          const res = await fetch(url, {
            method: 'POST',
            body: file.slice(start, end),
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-upload-id': uploadId,
              'x-chunk-index': String(i),
              'x-total-chunks': String(totalChunks),
            },
          })
          data = await res.json()
          if (!res.ok) throw new Error((data as {error?:string}).error || `Gagal bagian ${i + 1}`)
        }
      }

      setSukses(`"${data!.nama}" berhasil diupload!`)
      setFile(null)
      setNama('')
      if (inputRef.current) inputRef.current.value = ''
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload gagal')
    } finally {
      setUploading(false)
      setUploadInfo('')
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

  const mulaiRename = useCallback((track: MusicTrack) => {
    setRenameId(track.id)
    setRenameVal(track.nama)
    setTimeout(() => renameRef.current?.select(), 0)
  }, [])

  const batalRename = useCallback(() => {
    setRenameId(null)
    setRenameVal('')
  }, [])

  const simpanRename = async (id: number) => {
    if (!renameVal.trim()) return
    setRenameSaving(true)
    try {
      await fetch(`/api/music/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama: renameVal.trim() }),
      })
      setRenameId(null)
      load()
    } finally {
      setRenameSaving(false)
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
            {uploadInfo || (uploading ? '⏳ Mengupload...' : '⬆ Upload Musik')}
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
            <div key={t.id} className="bg-[#1A1814] border border-[#2A2520] rounded-xl px-4 py-3">
              {renameId === t.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xl shrink-0">🎵</span>
                  <input
                    ref={renameRef}
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') simpanRename(t.id)
                      if (e.key === 'Escape') batalRename()
                    }}
                    className="flex-1 bg-[#0F0E0C] border border-[#8B7355] rounded-lg px-2 py-1 text-sm focus:outline-none"
                  />
                  <button
                    onClick={() => simpanRename(t.id)}
                    disabled={renameSaving || !renameVal.trim()}
                    className="text-xs text-[#D8A23D] hover:text-[#E3B458] disabled:opacity-40 px-2 py-1 font-medium"
                  >
                    {renameSaving ? '...' : 'Simpan'}
                  </button>
                  <button
                    onClick={batalRename}
                    className="text-xs text-[#8A8378] hover:text-[#B3ACA1] px-2 py-1"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">🎵</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.nama}</p>
                      <p className="text-xs text-[#8A8378]">
                        {formatDurasi(t.durasi)} · {formatUkuran(t.ukuran)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      onClick={() => mulaiRename(t)}
                      className="text-xs text-[#8A8378] hover:text-[#D4C5A9] px-2 py-1"
                    >
                      Ganti Nama
                    </button>
                    <button
                      onClick={() => handleHapus(t.id)}
                      disabled={hapusId === t.id}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 px-2 py-1"
                    >
                      {hapusId === t.id ? '...' : 'Hapus'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
