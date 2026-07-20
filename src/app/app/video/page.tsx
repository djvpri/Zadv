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

interface MusicTrack {
  id: number
  nama: string
  durasi: number | null
}

const LABEL_STATUS: Record<string, string> = {
  pending: 'Menunggu diproses...',
  processing: 'Memotong & menambahkan subtitle...',
  done: 'Selesai!',
  error: 'Gagal',
}

const PLATFORM = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'facebook', label: 'Facebook' },
]

const TONE = [
  { id: 'santai', label: 'Santai' },
  { id: 'profesional', label: 'Profesional' },
  { id: 'urgent', label: 'Promo/FOMO' },
]

const CONTOH_SCRIPT = `Kamu capek catat transaksi manual?
Buku besar penuh, laporan berantakan.
Bisnis jadi susah berkembang.
ZPos hadir bantu kamu.
Transaksi jadi sekali klik.
Otomatis tercatat rapi.
Laporan penjualan langsung jadi.
Bisa pantau dari HP.
Di mana aja, kapan aja.
Kasir jadi lebih cepat.
Modal kecil hasil maksimal.
Cuma Rp100 ribu per bulan.
Bisa gratis 3 bulan pertama.
Coba sekarang, yuk!
Klik link di bawah buat daftar.`

function formatDurasi(detik: number | null) {
  if (!detik) return ''
  const m = Math.floor(detik / 60)
  const s = Math.floor(detik % 60)
  return ` · ${m}:${s.toString().padStart(2, '0')}`
}

export default function VideoPage() {
  const [apps, setApps] = useState<PromoApp[]>([])
  const [appId, setAppId] = useState<number | null>(null)
  const [platform, setPlatform] = useState('instagram')
  const [tone, setTone] = useState('santai')
  const [script, setScript] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [job, setJob] = useState<StatusJob | null>(null)
  const [error, setError] = useState('')
  const [deskripsi, setDeskripsi] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [styleUkuran, setStyleUkuran] = useState<'kecil'|'sedang'|'besar'>('sedang')
  const [stylePosisi, setStylePosisi] = useState<'bawah'|'tengah'|'atas'>('bawah')
  const [styleLatar, setStyleLatar] = useState<'transparan'|'samar'|'solid'>('samar')
  const [styleWarna, setStyleWarna] = useState<'putih'|'emas'>('putih')
  // Fitur musik baru
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([])
  const [musicTrackId, setMusicTrackId] = useState<number | null>(null)
  const [muteAsli, setMuteAsli] = useState(false)
  const [fadeOut, setFadeOut] = useState(true)
  const [loopMusik, setLoopMusik] = useState(true)
  const [mulaiDetik, setMulaiDetik] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch('/api/apps')
      .then((r) => r.json())
      .then((data: PromoApp[]) => {
        setApps(data)
        if (data.length > 0) setAppId(data[0].id)
      })
    fetch('/api/music')
      .then(r => r.json())
      .then(d => setMusicTracks(Array.isArray(d) ? d : []))
  }, [])

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function generateScript() {
    if (!appId) return
    setGenLoading(true)
    setError('')
    try {
      const res = await fetch('/api/generate/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, platform, tone, format: 'video' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal generate')
      if (data.script) {
        setScript(data.script)
        if (data.deskripsi) setDeskripsi(data.deskripsi)
        if (data.tags) setTags(data.tags)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal generate script')
    } finally {
      setGenLoading(false)
    }
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
    if (!file || !appId || !script.trim()) return
    setUploading(true)
    setError('')
    setJob(null)
    try {
      // Kirim file sebagai raw binary body, metadata lewat header JSON
      // (lebih andal dari URL params — tidak ada batas panjang, tidak terpengaruh cache proxy)
      const metadata: Record<string, unknown> = {
        appId,
        script,
        fileSize: file.size,
        style_ukuran: styleUkuran,
        style_posisi: stylePosisi,
        style_latar: styleLatar,
        style_warna: styleWarna,
        filename: file.name,
        type: file.type || 'video/mp4',
      }
      if (musicTrackId) metadata.musicTrackId = musicTrackId
      if (muteAsli) metadata.muteAsli = true
      if (fadeOut) metadata.fadeOut = true
      if (!loopMusik) metadata.noLoop = true
      if (mulaiDetik > 0) metadata.mulaiDetik = mulaiDetik

      const res = await fetch(`/api/video/upload`, {
        method: 'POST',
        body: file,
        headers: {
          'content-type': file.type || 'video/mp4',
          'x-video-metadata': JSON.stringify(metadata),
        },
      })
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

  const jumlahBaris = script.trim() ? script.split('\n').filter(Boolean).length : 0

  return (
    <div className="max-w-lg">
      <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-1">VIDEO PROMOSI — SUBTITLE</p>
      <p className="text-[11.5px] text-[#8A8378] mb-5 leading-relaxed">
        Upload video, otomatis dipotong jadi ~60 detik. Tiap baris skrip jadi
        subtitle ~3 detik — narasi mengalir alami.
      </p>

      <div className="rounded-lg bg-white/[0.03] border border-white/10 p-5 flex flex-col gap-4">
        {/* Pilih App */}
        <div>
          <p className="text-[11px] text-[#8A8378] mb-1.5">Untuk app</p>
          <div className="flex flex-wrap gap-1.5">
            {apps.length === 0 && (
              <p className="text-[11px] text-[#8A8378] italic">Belum ada app. Tambah di Kelola App dulu.</p>
            )}
            {apps.map((app) => (
              <button
                key={app.id}
                onClick={() => setAppId(app.id)}
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

        {/* Generate Skrip AI */}
        <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
          <p className="text-[11px] text-[#8A8378] mb-2">Generate skrip pakai AI (18-20 baris)</p>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {PLATFORM.map((p) => (
              <button key={p.id} onClick={() => setPlatform(p.id)}
                className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
                  platform === p.id ? 'bg-[#D8A23D] text-[#1C1917] border-[#D8A23D]' : 'border-white/15 text-[#B3ACA1]'
                }`}>{p.label}</button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {TONE.map((t) => (
              <button key={t.id} onClick={() => setTone(t.id)}
                className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
                  tone === t.id ? 'bg-[#D8A23D] text-[#1C1917] border-[#D8A23D]' : 'border-white/15 text-[#B3ACA1]'
                }`}>{t.label}</button>
            ))}
          </div>
          <button onClick={generateScript} disabled={genLoading || !appId}
            className="w-full py-1.5 rounded-md bg-[#D8A23D]/80 text-[#1C1917] text-[12px] font-semibold hover:bg-[#D8A23D] disabled:opacity-50 transition-colors">
            {genLoading ? '✍️ Menulis skrip...' : '✍️ Generate Skrip'}
          </button>
        </div>

        {/* Script Editor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] text-[#8A8378]">Skrip (satu baris = satu subtitle ~3 detik)</p>
            {jumlahBaris > 0 && (
              <span className="text-[10px] font-mono text-[#8A8378]">{jumlahBaris} baris</span>
            )}
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={10}
            placeholder={CONTOH_SCRIPT}
            className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-[13px] outline-none focus:border-[#D8A23D] font-mono resize-y leading-relaxed"
          />
          <p className="text-[10px] text-[#8A8378]/60 mt-1">Satu baris = satu subtitle ~3 detik. Edit bebas.</p>
        </div>

        {/* Deskripsi & Tags */}
        {deskripsi && (
          <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
            <p className="text-[11px] text-[#8A8378] mb-1">📝 Deskripsi</p>
            <p className="text-[12px] leading-relaxed">{deskripsi}</p>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((t) => (
                  <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-[#D8A23D]/20 text-[#D8A23D]">{t}</span>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                const teks = `${deskripsi}\n\n${tags.join(' ')}`
                navigator.clipboard?.writeText(teks).catch(() => {})
              }}
              className="mt-2 text-[11px] px-2 py-1 rounded border border-white/15 text-[#B3ACA1] hover:text-white transition-colors"
            >
              📋 Salin Deskripsi + Tags
            </button>
          </div>
        )}

        {/* Style Subtitle */}
        <div>
          <p className="text-[11px] text-[#8A8378] mb-1.5">Style teks</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-[#8A8378] mb-1">Ukuran</p>
              <div className="flex gap-1">
                {(['kecil','sedang','besar'] as const).map((u) => (
                  <button key={u} onClick={() => setStyleUkuran(u)}
                    className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                      styleUkuran === u ? 'bg-[#D8A23D] text-[#1C1917] border-[#D8A23D]' : 'border-white/15 text-[#B3ACA1]'
                    }`}>{u}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#8A8378] mb-1">Posisi</p>
              <div className="flex gap-1">
                {(['atas','tengah','bawah'] as const).map((p) => (
                  <button key={p} onClick={() => setStylePosisi(p)}
                    className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                      stylePosisi === p ? 'bg-[#D8A23D] text-[#1C1917] border-[#D8A23D]' : 'border-white/15 text-[#B3ACA1]'
                    }`}>{p}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#8A8378] mb-1">Latar</p>
              <div className="flex gap-1">
                {(['transparan','samar','solid'] as const).map((l) => (
                  <button key={l} onClick={() => setStyleLatar(l)}
                    className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                      styleLatar === l ? 'bg-[#D8A23D] text-[#1C1917] border-[#D8A23D]' : 'border-white/15 text-[#B3ACA1]'
                    }`}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#8A8378] mb-1">Warna</p>
              <div className="flex gap-1">
                {(['putih','emas'] as const).map((w) => (
                  <button key={w} onClick={() => setStyleWarna(w)}
                    className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                      styleWarna === w ? 'bg-[#D8A23D] text-[#1C1917] border-[#D8A23D]' : 'border-white/15 text-[#B3ACA1]'
                    }`}>{w}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* File Video */}
        <div>
          <p className="text-[11px] text-[#8A8378] mb-1.5">File video (maks 200MB)</p>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-[12px] text-[#B3ACA1] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-white/10 file:text-[#CFC9BE] file:text-[12px]"
          />
        </div>

        {/* Backsound Musik */}
        <div>
          <p className="text-[11px] text-[#8A8378] mb-1.5">🎵 Backsound (opsional)</p>
          <select
            value={musicTrackId ?? ''}
            onChange={e => setMusicTrackId(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-[12px] text-[#CFC9BE] focus:outline-none focus:border-[#8B7355]"
          >
            <option value="">— Tanpa musik —</option>
            {musicTracks.map(t => (
              <option key={t.id} value={t.id}>
                🎵 {t.nama}{formatDurasi(t.durasi)}
              </option>
            ))}
          </select>
          {musicTracks.length === 0 && (
            <p className="text-[10px] text-[#8A8378] mt-1">
              Belum ada musik. <a href="/app/musik" className="underline hover:text-[#D4C5A9]">Upload musik dulu →</a>
            </p>
          )}
          {musicTrackId && (
            <div className="mt-3 space-y-2 border border-white/10 rounded-xl p-3 bg-white/5">
              <p className="text-[10px] text-[#8A8378] font-medium uppercase tracking-wide mb-2">Opsi Audio</p>
              <p className="text-[10px] text-[#8A8378]">✂️ <span className="text-[#D4C5A9]">Potong otomatis</span> — musik berhenti saat video habis</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={fadeOut} onChange={e => setFadeOut(e.target.checked)} className="accent-[#D8A23D]" />
                <span className="text-[11px] text-[#CFC9BE]">🎚 Fade out 3 detik di akhir</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={loopMusik} onChange={e => setLoopMusik(e.target.checked)} className="accent-[#D8A23D]" />
                <span className="text-[11px] text-[#CFC9BE]">🔁 Loop musik jika lebih pendek dari video</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#CFC9BE] shrink-0">▶ Mulai dari detik</span>
                <input
                  type="number" min={0} step={1} value={mulaiDetik}
                  onChange={e => setMulaiDetik(Math.max(0, Number(e.target.value)))}
                  className="w-20 bg-[#0F0E0C] border border-white/10 rounded-md px-2 py-1 text-[11px] text-center focus:outline-none focus:border-[#8B7355]"
                />
                {musicTracks.find(t => t.id === musicTrackId)?.durasi && (
                  <>
                    <span className="text-[10px] text-[#8A8378]">/ {formatDurasi(musicTracks.find(t => t.id === musicTrackId)!.durasi)}</span>
                    <button
                      onClick={() => {
                        const track = musicTracks.find(t => t.id === musicTrackId)
                        const durasi = track?.durasi ?? 0
                        const max = Math.max(0, Math.floor(durasi - 30))
                        setMulaiDetik(Math.floor(Math.random() * max))
                      }}
                      title="Mulai dari posisi acak"
                      className="text-[13px] px-2 py-0.5 rounded border border-white/10 hover:border-[#D8A23D] hover:bg-[#D8A23D]/10 transition-colors"
                    >🎲</button>
                  </>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-white/5">
                <input type="checkbox" checked={muteAsli} onChange={e => setMuteAsli(e.target.checked)} className="accent-[#D8A23D]" />
                <span className="text-[11px] text-[#CFC9BE]">🔇 Mute audio asli (hanya musik)</span>
              </label>
            </div>
          )}
        </div>

        {/* Proses */}
        <button
          onClick={upload}
          disabled={uploading || !file || !appId || !script.trim()}
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
            <a href={`/api/video/${job.id}/download`} download
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#D8A23D] text-[#1C1917] text-[12px] font-semibold hover:bg-[#E3B458] transition-colors">
              ⬇️ Unduh Video
            </a>
          )}
          {(job.status === 'pending' || job.status === 'processing') && (
            <p className="text-[10.5px] text-[#6B6459] mt-2">Video sedang diproses — polling tiap 3 detik.</p>
          )}
        </div>
      )}
    </div>
  )
}
