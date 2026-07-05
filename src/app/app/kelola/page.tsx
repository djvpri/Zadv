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
}

const KOSONG = { nama: '', emoji: '📦', tagline: '', fitur: '', accent: '#2563EB', tint: '#EBF1FF', url: '' }

export default function KelolaApp() {
  const [apps, setApps] = useState<PromoApp[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<number | null>(null) // null = tidak edit, 0 = form tambah baru
  const [form, setForm] = useState(KOSONG)
  const [saving, setSaving] = useState(false)

  const muat = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/apps')
    setApps(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { muat() }, [muat])

  function mulaiTambah() {
    setForm(KOSONG)
    setEdit(0)
  }

  function mulaiEdit(app: PromoApp) {
    setForm({
      nama: app.nama, emoji: app.emoji, tagline: app.tagline,
      fitur: app.fitur.join('\n'), accent: app.accent, tint: app.tint, url: app.url || '',
    })
    setEdit(app.id)
  }

  async function simpan() {
    setSaving(true)
    const payload = {
      nama: form.nama, emoji: form.emoji, tagline: form.tagline,
      fitur: form.fitur.split('\n').map((f) => f.trim()).filter(Boolean),
      accent: form.accent, tint: form.tint, url: form.url || null,
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

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-[#CFC9BE]">Daftar App ({apps.length})</h2>
        <button
          onClick={mulaiTambah}
          className="px-3 py-1.5 rounded-md bg-[#D8A23D] text-[#1C1917] text-[12px] font-semibold hover:bg-[#E3B458] transition-colors"
        >
          + Tambah App
        </button>
      </div>

      {edit !== null && (
        <div className="mb-5 rounded-lg bg-white/[0.03] border border-white/10 p-5">
          <p className="text-[12px] font-semibold text-[#CFC9BE] mb-3">{edit ? 'Edit App' : 'App Baru'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex gap-3">
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
              className="col-span-2 bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm outline-none focus:border-[#D8A23D]"
            />
            <textarea
              value={form.fitur}
              onChange={(e) => setForm({ ...form, fitur: e.target.value })}
              placeholder={'Satu fitur per baris, tekan Enter untuk pisah\nContoh:\nProses transaksi cepat\nSupport tunai, QRIS, dan transfer\nStok otomatis berkurang'}
              rows={4}
              className="col-span-2 bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm outline-none focus:border-[#D8A23D] resize-y font-sans"
            />
            <input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="URL app (opsional)"
              className="col-span-2 bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm outline-none focus:border-[#D8A23D]"
            />
            <label className="flex items-center gap-2 text-[11px] text-[#8A8378]">
              Warna aksen
              <input type="color" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} className="w-8 h-8 rounded cursor-pointer bg-transparent" />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-[#8A8378]">
              Warna latar poster
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
      )}

      {loading ? (
        <p className="text-[#8A8378] text-sm">Memuat...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {apps.map((app) => (
            <div key={app.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/[0.03] border border-white/10">
              <span className="text-xl">{app.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium">{app.nama}</div>
                <div className="text-[11px] text-[#8A8378] truncate">{app.tagline}</div>
              </div>
              <button onClick={() => mulaiEdit(app)} className="text-[11.5px] text-[#B3ACA1] hover:text-white px-2 py-1">
                Edit
              </button>
              <button onClick={() => hapus(app.id)} className="text-[11.5px] text-red-400/70 hover:text-red-400 px-2 py-1">
                Hapus
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
