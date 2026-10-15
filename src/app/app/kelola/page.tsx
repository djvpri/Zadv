'use client'
import { useState, useEffect, useCallback } from 'react'

interface PromoApp {
  id: number
  nama: string
  emoji: string
  tagline: string
  fitur: string[]
  accent: string
  tint: string
  url?: string | null
  urutan?: number
}

const KOSONG = { nama: '', emoji: '📦', tagline: '', fitur: [] as string[], accent: '#2563EB', tint: '#EBF1FF', url: '' }

export default function KelolaApp() {
  const [apps, setApps] = useState<PromoApp[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<number | null>(null) // null = list, 0 = tambah, >0 = edit id
  const [form, setForm] = useState(KOSONG)
  const [saving, setSaving] = useState(false)
  const [cari, setCari] = useState('')
  const [fiturInput, setFiturInput] = useState('')

  const muat = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/apps')
    setApps(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { muat() }, [muat])

  function mulaiTambah() {
    setForm(KOSONG)
    setFiturInput('')
    setEdit(0)
  }

  function mulaiEdit(app: PromoApp) {
    setForm({
      nama: app.nama, emoji: app.emoji, tagline: app.tagline,
      fitur: [...app.fitur], accent: app.accent, tint: app.tint, url: app.url || '',
    })
    setFiturInput('')
    setEdit(app.id)
  }

  function tambahFitur() {
    const v = fiturInput.trim()
    if (v && !form.fitur.includes(v)) {
      setForm({ ...form, fitur: [...form.fitur, v] })
      setFiturInput('')
    }
  }

  function hapusFitur(f: string) {
    setForm({ ...form, fitur: form.fitur.filter(x => x !== f) })
  }

  function fiturKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); tambahFitur() }
  }

  async function simpan() {
    setSaving(true)
    const payload = {
      nama: form.nama, emoji: form.emoji, tagline: form.tagline,
      fitur: form.fitur, accent: form.accent, tint: form.tint,
      url: form.url || null,
    }
    const url = edit ? `/api/apps/${edit}` : '/api/apps'
    const method = edit ? 'PUT' : 'POST'
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    setEdit(null)
    muat()
  }

  async function hapus(id: number) {
    if (!confirm('Hapus app ini dari daftar? Riwayat konten yang sudah dibuat tetap tersimpan.')) return
    await fetch(`/api/apps/${id}`, { method: 'DELETE' })
    muat()
  }

  async function reorder(id: number, arah: -1 | 1) {
    const urut = [...apps].sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0))
    const idx = urut.findIndex(a => a.id === id)
    const tukar = idx + arah
    if (tukar < 0 || tukar >= urut.length) return
    const a = urut[idx], b = urut[tukar]
    await Promise.all([
      fetch(`/api/apps/${a.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urutan: b.urutan ?? 0 }) }),
      fetch(`/api/apps/${b.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urutan: a.urutan ?? 0 }) }),
    ])
    muat()
  }

  const difilter = apps.filter(a =>
    a.nama.toLowerCase().includes(cari.toLowerCase()) ||
    a.tagline.toLowerCase().includes(cari.toLowerCase())
  )

  const linkTampil = (url?: string | null) =>
    (url || '').replace(/^https?:\/\//, '').replace(/\/$/, '')

  // ── Edit / Tambah form ──
  if (edit !== null) {
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-[#CFC9BE]">{edit ? 'Edit App' : 'App Baru'}</h2>
          <button onClick={() => setEdit(null)} className="text-[12px] text-[#8A8378] hover:text-white">← Kembali</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
          {/* Form */}
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-5">
            <div className="flex gap-3 mb-3">
              <input
                value={form.emoji}
                onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                placeholder="Emoji"
                className="w-16 bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm text-center outline-none focus:border-[#D8A23D]"
              />
              <input
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
                placeholder="Nama app"
                className="flex-1 bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm outline-none focus:border-[#D8A23D]"
              />
            </div>
            <input
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="Tagline singkat"
              className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm mb-3 outline-none focus:border-[#D8A23D]"
            />

            {/* Tag input untuk fitur */}
            <p className="text-[10px] text-[#8A8378] uppercase tracking-wide mb-1.5">Fitur (Enter untuk tambah)</p>
            <div className="flex flex-wrap gap-1.5 min-h-[38px] bg-white/5 border border-white/15 rounded-md px-2 py-2 items-center focus-within:border-[#D8A23D] mb-3">
              {form.fitur.map((f) => (
                <span key={f} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-[#D8A23D]/15 text-[#D8A23D]">
                  {f}
                  <button onClick={() => hapusFitur(f)} className="text-[13px] leading-none hover:text-white">×</button>
                </span>
              ))}
              <input
                value={fiturInput}
                onChange={(e) => setFiturInput(e.target.value)}
                onKeyDown={fiturKeyDown}
                onBlur={tambahFitur}
                placeholder="Ketik fitur..."
                className="flex-1 min-w-[100px] bg-transparent border-none text-[12px] text-[#E7E2DC] outline-none"
              />
            </div>

            <input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="URL app (opsional)"
              className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm mb-3 outline-none focus:border-[#D8A23D]"
            />

            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 text-[11px] text-[#8A8378]">
                Aksen
                <input type="color" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
              </label>
              <label className="flex items-center gap-2 text-[11px] text-[#8A8378]">
                Latar
                <input type="color" value={form.tint} onChange={(e) => setForm({ ...form, tint: e.target.value })} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
              </label>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={simpan}
                disabled={saving || !form.nama || !form.tagline}
                className="px-4 py-2 rounded-md bg-[#D8A23D] text-[#1C1917] text-[12.5px] font-semibold hover:bg-[#E3B458] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
              <button
                onClick={() => setEdit(null)}
                className="px-4 py-2 rounded-md border border-white/15 text-[#B3ACA1] text-[12.5px] hover:bg-white/5 transition-colors"
              >
                Batal
              </button>
            </div>
          </div>

          {/* Live preview */}
          <div className="w-full lg:w-[280px]">
            <p className="text-[10px] text-[#8A8378] uppercase tracking-wide mb-2">Preview Poster</p>
            <div
              className="rounded-lg p-5 relative overflow-hidden"
              style={{ backgroundColor: form.tint }}
            >
              <div
                className="absolute -right-8 -top-8 w-[120px] h-[120px] rounded-full opacity-[0.12]"
                style={{ backgroundColor: form.accent }}
              />
              <div className="relative flex flex-col gap-3">
                <div className="text-[32px] leading-none">{form.emoji || '📦'}</div>
                <div className="text-[20px] font-extrabold" style={{ color: form.accent }}>{form.nama || 'Nama App'}</div>
                <div className="text-[12px] text-[#4A453D]">{form.tagline || 'Tagline singkat'}</div>
                <div className="flex flex-col gap-1.5 mt-1">
                  {form.fitur.slice(0, 3).map((f) => (
                    <div key={f} className="text-[12px] text-[#4A453D] flex items-center gap-2">
                      <span style={{ color: form.accent }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>
                {linkTampil(form.url) && (
                  <div className="text-[11px] font-semibold mt-2" style={{ color: form.accent }}>{linkTampil(form.url)}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── List view ──
  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#CFC9BE]">Daftar App ({apps.length})</span>
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari app..."
            className="bg-white/5 border border-white/15 rounded-md px-3 py-1.5 text-[12px] text-[#E7E2DC] outline-none focus:border-[#D8A23D] w-[180px]"
          />
        </div>
        <button
          onClick={mulaiTambah}
          className="px-3 py-1.5 rounded-md bg-[#D8A23D] text-[#1C1917] text-[12px] font-semibold hover:bg-[#E3B458] transition-colors"
        >
          + Tambah App
        </button>
      </div>

      {loading ? (
        <p className="text-[#8A8378] text-sm">Memuat...</p>
      ) : difilter.length === 0 ? (
        <div className="text-center py-12 text-[#8A8378]">
          <p className="text-2xl mb-2">📦</p>
          <p className="text-sm">{cari ? 'Tidak ada app yang cocok.' : 'Belum ada app. Klik "Tambah App" untuk mulai.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {difilter.map((app) => {
            const urut = [...apps].sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0))
            const idx = urut.findIndex(a => a.id === app.id)
            return (
              <div
                key={app.id}
                className="relative rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden hover:border-white/20 transition-colors"
              >
                {/* Accent strip */}
                <div className="absolute left-0 top-0 w-1 h-full" style={{ backgroundColor: app.accent }} />

                <div className="pl-4 pr-3 py-3">
                  {/* Head */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{app.emoji}</span>
                    <span className="text-[13px] font-medium flex-1 truncate">{app.nama}</span>
                    {/* Reorder buttons */}
                    <div className="flex flex-col">
                      <button
                        onClick={() => reorder(app.id, -1)}
                        disabled={idx === 0}
                        className="text-[9px] text-[#8A8378] hover:text-[#E7E2DC] disabled:opacity-30 leading-none px-1"
                      >▲</button>
                      <button
                        onClick={() => reorder(app.id, 1)}
                        disabled={idx === urut.length - 1}
                        className="text-[9px] text-[#8A8378] hover:text-[#E7E2DC] disabled:opacity-30 leading-none px-1"
                      >▼</button>
                    </div>
                  </div>

                  {/* Tagline */}
                  <p className="text-[11px] text-[#8A8378] truncate mb-2">{app.tagline}</p>

                  {/* Fitur chips */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {app.fitur.slice(0, 3).map((f) => (
                      <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[#B3ACA1]">{f}</span>
                    ))}
                    {app.fitur.length > 3 && (
                      <span className="text-[10px] px-1 py-0.5 text-[#8A8378]">+{app.fitur.length - 3}</span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: app.accent }} />
                      <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: app.tint }} />
                      {linkTampil(app.url) ? (
                        <a
                          href={app.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[#6B8FE8] hover:underline ml-1 truncate max-w-[120px]"
                        >{linkTampil(app.url)} ↗</a>
                      ) : (
                        <span className="text-[10px] text-[#8A8378] ml-1">{app.fitur.length} fitur</span>
                      )}
                    </div>
                    <div className="flex gap-0.5">
                      <button onClick={() => mulaiEdit(app)} className="text-[11px] text-[#B3ACA1] hover:text-white px-2 py-1 rounded hover:bg-white/5">Edit</button>
                      <button onClick={() => hapus(app.id)} className="text-[11px] text-red-400/70 hover:text-red-400 px-2 py-1 rounded hover:bg-white/5">Hapus</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
