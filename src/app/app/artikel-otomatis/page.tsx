'use client'
import { useState, useEffect, useCallback } from 'react'

interface AppSetting {
  id: number
  nama: string
  emoji: string
  url: string | null
  artikelAktif: boolean
  punyaWeb: boolean
}

interface Settings {
  autopost: boolean
  jam: string
  tujuanZomet: boolean
  tujuanApp: boolean
  apps: AppSetting[]
  stats: { publishedCount: number; draftCount: number; scheduledCount: number; failedCount: number }
}

interface RiwayatItem {
  id: number
  appId: number | null
  appName: string
  appEmoji: string
  judul: string
  slug: string
  status: string
  publishedAt: string | null
  scheduledFor: string | null
  fotoId: number | null
  createdAt: string
}

interface IdeItem {
  id: number
  appId: number | null
  appName: string | null
  appEmoji: string
  teks: string
  status: string
  createdAt: string
}

interface FotoItem {
  id: number
  appId: number | null
  appName: string | null
  appEmoji: string
  url: string
  filename: string
  tags: string[]
  useCount: number
  lastUsedAt: string | null
  createdAt: string
}

const JAM_OPTIONS = ['06:00', '07:00', '08:00', '09:00', '12:00']

type Tab = 'artikel' | 'ide' | 'foto'

export default function ArtikelOtomatisPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [riwayat, setRiwayat] = useState<RiwayatItem[]>([])
  const [ides, setIdes] = useState<IdeItem[]>([])
  const [fotos, setFotos] = useState<FotoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genStatus, setGenStatus] = useState('')
  const [preGenerating, setPreGenerating] = useState(false)
  const [preGenStatus, setPreGenStatus] = useState('')
  const [tab, setTab] = useState<Tab>('artikel')

  // Ide form
  const [ideTeks, setIdeTeks] = useState('')
  const [ideAppId, setIdeAppId] = useState<string>('')

  // Foto form
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoTags, setFotoTags] = useState<string[]>([])
  const [fotoTagInput, setFotoTagInput] = useState('')
  const [fotoAppId, setFotoAppId] = useState<string>('')

  const muat = useCallback(async () => {
    setLoading(true)
    const [sRes, rRes] = await Promise.all([
      fetch('/api/artikel/settings'),
      fetch('/api/artikel/riwayat?limit=20'),
    ])
    setSettings(await sRes.json())
    setRiwayat((await rRes.json()).items)
    setLoading(false)
  }, [])

  const muatIde = useCallback(async () => {
    const res = await fetch('/api/artikel/ide?status=all')
    const data = await res.json()
    setIdes(data.items)
  }, [])

  const muatFoto = useCallback(async () => {
    const res = await fetch('/api/artikel/foto')
    const data = await res.json()
    setFotos(data.items)
  }, [])

  useEffect(() => { muat() }, [muat])
  useEffect(() => { if (tab === 'ide') muatIde() }, [tab, muatIde])
  useEffect(() => { if (tab === 'foto') muatFoto() }, [tab, muatFoto])

  async function simpanSettings(patch: Record<string, unknown>) {
    setSaving(true)
    await fetch('/api/artikel/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setSaving(false)
    muat()
  }

  async function toggleApp(id: number, aktif: boolean) {
    if (!settings) return
    const appSettings = settings.apps.map(a =>
      a.id === id ? { id: a.id, artikelAktif: !aktif } : { id: a.id, artikelAktif: a.artikelAktif }
    )
    await simpanSettings({ appSettings })
  }

  async function generateSemua() {
    setGenerating(true)
    setGenStatus('Generating semua artikel...')
    try {
      const res = await fetch('/api/artikel/trigger', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const pub = data.published?.ok || 0
        const gen = data.generated?.ok || 0
        setGenStatus(`Published: ${pub}, Generated: ${gen}, Failed: ${data.fail || 0}`)
      } else {
        setGenStatus('Gagal: ' + (data.error || 'unknown'))
      }
    } catch {
      setGenStatus('Gagal: network error')
    }
    setTimeout(() => { setGenerating(false); setGenStatus(''); muat() }, 4000)
  }

  async function preGenerate() {
    setPreGenerating(true)
    setPreGenStatus('Pre-generate 3 hari...')
    try {
      const res = await fetch('/api/artikel/pre-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 3 }),
      })
      const data = await res.json()
      if (res.ok) {
        setPreGenStatus(`Selesai: ${data.ok} generated, ${data.fail} failed`)
      } else {
        setPreGenStatus('Gagal: ' + (data.error || 'unknown'))
      }
    } catch {
      setPreGenStatus('Gagal: network error')
    }
    setTimeout(() => { setPreGenerating(false); setPreGenStatus(''); muat() }, 5000)
  }

  // Ide handlers
  async function tambahIde() {
    if (!ideTeks.trim()) return
    await fetch('/api/artikel/ide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teks: ideTeks.trim(), appId: ideAppId ? Number(ideAppId) : null }),
    })
    setIdeTeks('')
    muatIde()
  }

  async function hapusIde(id: number) {
    await fetch(`/api/artikel/ide?id=${id}`, { method: 'DELETE' })
    muatIde()
  }

  // Foto handlers
  async function uploadFoto() {
    if (!fotoFile) return
    const formData = new FormData()
    formData.append('file', fotoFile)
    formData.append('tags', fotoTags.join(','))
    formData.append('appId', fotoAppId)
    await fetch('/api/artikel/foto', { method: 'POST', body: formData })
    setFotoFile(null)
    setFotoTags([])
    setFotoTagInput('')
    muatFoto()
  }

  async function hapusFoto(id: number) {
    await fetch(`/api/artikel/foto?id=${id}`, { method: 'DELETE' })
    muatFoto()
  }

  function addFotoTag() {
    const t = fotoTagInput.trim().toLowerCase()
    if (t && !fotoTags.includes(t)) {
      setFotoTags([...fotoTags, t])
    }
    setFotoTagInput('')
  }

  if (loading || !settings) {
    return <div className="p-6 text-sm text-[#8A8378]">Memuat...</div>
  }

  const activeCount = settings.apps.filter(a => a.artikelAktif).length
  const scheduledItems = riwayat.filter(r => r.status === 'scheduled')

  // Group scheduled by date
  const scheduledByDate: Record<string, RiwayatItem[]> = {}
  for (const r of scheduledItems) {
    const dateKey = r.scheduledFor ? new Date(r.scheduledFor).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'unknown'
    if (!scheduledByDate[dateKey]) scheduledByDate[dateKey] = []
    scheduledByDate[dateKey].push(r)
  }

  const pendingIdes = ides.filter(i => i.status === 'pending')
  const usedIdes = ides.filter(i => i.status === 'used')
  const globalIdes = pendingIdes.filter(i => i.appId === null)
  const appIdes = pendingIdes.filter(i => i.appId !== null)

  return (
    <div className="max-w-[960px] mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-[#CFC9BE]">Artikel <span className="text-[#D8A23D]">Otomatis</span></h2>
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] text-[#8A8378] uppercase tracking-wide">Autopost</span>
          <button
            onClick={() => simpanSettings({ autopost: !settings.autopost })}
            className={`relative w-[44px] h-[24px] rounded-full cursor-pointer transition-colors ${settings.autopost ? 'bg-[#4ADE80]/15' : 'bg-white/10'}`}
          >
            <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full transition-all ${settings.autopost ? 'left-[23px] bg-[#4ADE80]' : 'left-[3px] bg-[#8A8378]'}`} />
          </button>
          <span className={`text-xs font-semibold ${settings.autopost ? 'text-[#4ADE80]' : 'text-[#8A8378]'}`}>
            {settings.autopost ? 'AKTIF' : 'NONAKTIF'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-3.5 border-b border-white/10">
        <button
          onClick={() => setTab('artikel')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${tab === 'artikel' ? 'text-[#D8A23D] border-[#D8A23D]' : 'text-[#8A8378] border-transparent hover:text-[#CFC9BE]'}`}
        >
          Artikel
        </button>
        <button
          onClick={() => setTab('ide')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${tab === 'ide' ? 'text-[#D8A23D] border-[#D8A23D]' : 'text-[#8A8378] border-transparent hover:text-[#CFC9BE]'}`}
        >
          Ide <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] px-1 ${tab === 'ide' ? 'bg-[#D8A23D]/20 text-[#D8A23D]' : 'bg-white/8 text-[#8A8378]'}">{pendingIdes.length}</span>
        </button>
        <button
          onClick={() => setTab('foto')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${tab === 'foto' ? 'text-[#D8A23D] border-[#D8A23D]' : 'text-[#8A8378] border-transparent hover:text-[#CFC9BE]'}`}
        >
          Foto <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] px-1 ${tab === 'foto' ? 'bg-[#D8A23D]/20 text-[#D8A23D]' : 'bg-white/8 text-[#8A8378]'}">{fotos.length}</span>
        </button>
      </div>

      {/* ===== TAB: ARTIKEL ===== */}
      {tab === 'artikel' && (
        <>
          {/* Schedule + Trigger */}
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4 mb-3.5">
            <div className="flex items-center gap-5 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#8A8378] uppercase tracking-wide">Jam Posting</label>
                <select
                  value={settings.jam}
                  onChange={(e) => simpanSettings({ jam: e.target.value })}
                  className="bg-white/5 border border-white/15 rounded-md px-3 py-1.5 text-[13px] font-medium outline-none focus:border-[#D8A23D] cursor-pointer"
                >
                  {JAM_OPTIONS.map(j => <option key={j}>{j} WIB</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#8A8378] uppercase tracking-wide">App Aktif (punya web)</label>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#D8A23D]/15 rounded-md text-xs">
                  <span className="text-[#D8A23D] font-bold text-sm">{activeCount}</span>
                  <span className="text-[#8A8378]">dari {settings.apps.length} app</span>
                </div>
              </div>
              {preGenerating && (
                <div className="flex items-center gap-2 px-3.5 py-2 bg-[#A78BFA]/15 rounded-md text-xs text-[#A78BFA]">
                  <div className="w-3.5 h-3.5 border-2 border-[#A78BFA]/30 border-t-[#A78BFA] rounded-full animate-spin" />
                  <span>{preGenStatus || 'Pre-generating...'}</span>
                </div>
              )}
              {generating && (
                <div className="flex items-center gap-2 px-3.5 py-2 bg-[#D8A23D]/15 rounded-md text-xs text-[#D8A23D]">
                  <div className="w-3.5 h-3.5 border-2 border-[#D8A23D]/30 border-t-[#D8A23D] rounded-full animate-spin" />
                  <span>{genStatus || 'Generating...'}</span>
                </div>
              )}
              <button
                onClick={preGenerate}
                disabled={preGenerating}
                className="ml-auto px-4 py-2 rounded-md bg-[#A78BFA]/15 border border-[#A78BFA]/30 text-[#A78BFA] text-xs font-bold cursor-pointer hover:bg-[#A78BFA]/25 disabled:opacity-50 transition-colors"
              >
                {preGenerating ? '...' : '⚡ Pre-generate 3 Hari'}
              </button>
              <button
                onClick={generateSemua}
                disabled={generating}
                className="px-4 py-2 rounded-md bg-[#D8A23D] text-[#1C1917] text-xs font-bold cursor-pointer hover:bg-[#E3B458] disabled:opacity-50 transition-colors"
              >
                {generating ? '...' : 'Generate Sekarang'}
              </button>
            </div>
          </div>

          {/* Scheduled Timeline */}
          {scheduledItems.length > 0 && (
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4 mb-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-[#8A8378] uppercase tracking-wide"> Jadwal Artikel — {scheduledItems.length} scheduled</p>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#A78BFA]/15 text-[#A78BFA]">{scheduledItems.length} scheduled</span>
              </div>
              {Object.entries(scheduledByDate).map(([dateKey, items]) => (
                <div key={dateKey} className="flex items-start gap-4 py-3 border-b border-white/5 last:border-0">
                  <div className="w-16 flex-shrink-0 text-center">
                    <div className="text-xl font-bold text-[#A78BFA] leading-none">{dateKey.split(' ')[0]}</div>
                    <div className="text-[10px] text-[#8A8378] uppercase mt-0.5">{dateKey.split(' ')[1]}</div>
                  </div>
                  <div className="flex-1 flex flex-col gap-1.5">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.02] border border-white/10 rounded-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] flex-shrink-0" />
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#A78BFA]/15 text-[#A78BFA]">scheduled</span>
                        <span className="text-sm">{item.appEmoji}</span>
                        <span className="text-xs font-semibold text-[#CFC9BE]">{item.appName}</span>
                        <span className="text-[11px] text-[#8A8378] truncate flex-1">{item.judul}</span>
                        {item.fotoId && <span className="px-1 py-0.5 rounded text-[9px] bg-white/5 text-[#8A8378]">foto</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* App List */}
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4 mb-3.5">
            <p className="text-[10px] text-[#8A8378] uppercase tracking-wide mb-3">App Aktif — Artikel Harian</p>
            <div className="flex flex-col gap-1.5">
              {settings.apps.map(app => (
                <div key={app.id} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md border transition-colors ${app.artikelAktif ? 'border-[#D8A23D]/30 bg-white/[0.02]' : 'border-white/10 opacity-50'}`}>
                  <button
                    onClick={() => toggleApp(app.id, app.artikelAktif)}
                    disabled={!app.punyaWeb}
                    className={`relative w-[44px] h-[24px] rounded-full transition-colors flex-shrink-0 ${app.artikelAktif ? 'bg-[#4ADE80]/15' : 'bg-white/10'} ${!app.punyaWeb ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'}`}
                  >
                    <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full transition-all ${app.artikelAktif ? 'left-[23px] bg-[#4ADE80]' : 'left-[3px] bg-[#8A8378]'}`} />
                  </button>
                  <span className="text-base w-5 text-center">{app.emoji}</span>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-[#CFC9BE]">{app.nama}</div>
                    <div className={`text-[10px] font-mono mt-0.5 ${app.punyaWeb ? 'text-[#60A5FA]' : 'text-[#8A8378] italic'}`}>
                      {app.url ? app.url.replace(/^https?:\/\//, '') : 'belum ada web'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Riwayat */}
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4 mb-3.5">
            <p className="text-[10px] text-[#8A8378] uppercase tracking-wide mb-3">Riwayat Artikel</p>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-[10px] uppercase tracking-wide text-[#8A8378] px-2 py-1.5 border-b border-white/10">Schedule</th>
                  <th className="text-left text-[10px] uppercase tracking-wide text-[#8A8378] px-2 py-1.5 border-b border-white/10">App</th>
                  <th className="text-left text-[10px] uppercase tracking-wide text-[#8A8378] px-2 py-1.5 border-b border-white/10">Judul</th>
                  <th className="text-left text-[10px] uppercase tracking-wide text-[#8A8378] px-2 py-1.5 border-b border-white/10">Status</th>
                  <th className="px-2 py-1.5 border-b border-white/10"></th>
                </tr>
              </thead>
              <tbody>
                {riwayat.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-4 text-center text-[#8A8378] text-xs">Belum ada artikel.</td></tr>
                )}
                {riwayat.map(a => {
                  const tanggal = a.scheduledFor || a.publishedAt || a.createdAt
                  const tgl = new Date(tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                  return (
                    <tr key={a.id} className="hover:bg-white/[0.02]">
                      <td className="px-2 py-2 text-xs whitespace-nowrap" style={{ color: a.status === 'scheduled' ? '#A78BFA' : '#8A8378' }}>{tgl}</td>
                      <td className="px-2 py-2 text-xs whitespace-nowrap">{a.appEmoji} {a.appName}</td>
                      <td className="px-2 py-2 text-xs text-[#E7E2DC] max-w-[200px] truncate">{a.judul}</td>
                      <td className="px-2 py-2 text-xs">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                          a.status === 'published' ? 'bg-[#4ADE80]/15 text-[#4ADE80]' :
                          a.status === 'scheduled' ? 'bg-[#A78BFA]/15 text-[#A78BFA]' :
                          a.status === 'draft' ? 'bg-[#FBBF24]/15 text-[#FBBF24]' :
                          'bg-[#F87171]/15 text-[#F87171]'
                        }`}>
                          {a.status === 'published' ? '✓ Published' :
                           a.status === 'scheduled' ? '◐ Scheduled' :
                           a.status === 'draft' ? '◐ Draft' : '✕ Failed'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {a.status === 'published' ? (
                          <a href={`https://www.zomet.my.id/artikel/${a.slug}`} target="_blank" rel="noopener" className="text-[#D8A23D] text-[11px] hover:underline">Lihat →</a>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4">
            <div className="flex items-center gap-6 flex-wrap">
              <span className="flex items-center gap-1.5 text-[11px]"><span className="w-2 h-2 rounded-full bg-[#4ADE80]" /><span className="text-[#8A8378]">Gemini API</span></span>
              <span className="flex items-center gap-1.5 text-[11px]"><span className="w-2 h-2 rounded-full bg-[#4ADE80]" /><span className="text-[#8A8378]">GitHub Token</span></span>
              <span className="flex items-center gap-1.5 text-[11px]"><span className="w-2 h-2 rounded-full bg-[#4ADE80]" /><span className="text-[#8A8378]">Database</span></span>
              <div className="ml-auto flex gap-5">
                <span className="text-[11px] text-[#8A8378]">Bulan ini: <strong className="text-[#E7E2DC] font-semibold">{settings.stats.publishedCount} published</strong></span>
                <span className="text-[11px] text-[#8A8378]"><strong className="text-[#A78BFA] font-semibold">{settings.stats.scheduledCount} scheduled</strong></span>
                <span className="text-[11px] text-[#8A8378]"><strong className="text-[#FBBF24] font-semibold">{settings.stats.draftCount} draft</strong></span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== TAB: IDE ===== */}
      {tab === 'ide' && (
        <>
          {/* Input */}
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4 mb-3.5">
            <p className="text-[10px] text-[#8A8378] uppercase tracking-wide mb-3">Tambah Ide Artikel</p>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                value={ideTeks}
                onChange={(e) => setIdeTeks(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && tambahIde()}
                placeholder="Contoh: Tips efisiensi kasir untuk warung kecil..."
                className="flex-1 bg-white/5 border border-white/15 rounded-md px-3 py-2 text-[13px] text-[#CFC9BE] outline-none focus:border-[#D8A23D]"
              />
              <select
                value={ideAppId}
                onChange={(e) => setIdeAppId(e.target.value)}
                className="bg-white/5 border border-white/15 rounded-md px-3 py-2 text-[13px] font-medium text-[#CFC9BE] outline-none cursor-pointer"
              >
                <option value=""> Global (semua app)</option>
                {settings.apps.filter(a => a.punyaWeb).map(a => <option key={a.id} value={a.id}>{a.emoji} {a.nama}</option>)}
              </select>
              <button onClick={tambahIde} disabled={!ideTeks.trim()} className="px-4 py-2 rounded-md bg-[#D8A23D] text-[#1C1917] text-xs font-bold cursor-pointer hover:bg-[#E3B458] disabled:opacity-50">+ Tambah</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] text-[#8A8378] self-center mr-1">Saran:</span>
              {['Tips UMKM', 'Kisah sukses', 'Panduan pemula', 'FAQ pelanggan', 'Perbandingan manual vs digital', 'Tren bisnis 2026'].map(s => (
                <button key={s} onClick={() => setIdeTeks(s)} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-[11px] text-[#8A8378] hover:border-[#D8A23D] hover:text-[#D8A23D] hover:bg-[#D8A23D]/8 cursor-pointer transition-all">{s}</button>
              ))}
            </div>
          </div>

          {/* Pending ides */}
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4 mb-3.5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-[#8A8378] uppercase tracking-wide m-0">Antrian Ide — {pendingIdes.length} pending</p>
            </div>

            {globalIdes.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#60A5FA]/15 text-[#60A5FA]"> GLOBAL</span>
                  <span className="text-[11px] text-[#8A8378]">Dipakai semua app kalau antrian app kosong</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {globalIdes.map(ide => (
                    <div key={ide.id} className="flex items-center gap-2.5 px-2.5 py-2 bg-white/[0.02] border border-white/10 rounded-md hover:border-[#D8A23D]/20">
                      <div className="w-5 h-5 rounded-full bg-[#D8A23D]/15 text-[#D8A23D] text-[10px] font-bold flex items-center justify-center flex-shrink-0">{globalIdes.indexOf(ide) + 1}</div>
                      <div className="flex-1">
                        <div className="text-xs text-[#E7E2DC]">{ide.teks}</div>
                        <div className="text-[10px] text-[#8A8378] mt-0.5">{new Date(ide.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#60A5FA]/15 text-[#60A5FA]">global</span>
                      <button onClick={() => hapusIde(ide.id)} className="text-[#F87171] text-[11px] opacity-60 hover:opacity-100">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {appIdes.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] text-[#8A8378]">Spesifik App</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {appIdes.map(ide => (
                    <div key={ide.id} className="flex items-center gap-2.5 px-2.5 py-2 bg-white/[0.02] border border-white/10 rounded-md hover:border-[#D8A23D]/20">
                      <div className="w-5 h-5 rounded-full bg-[#D8A23D]/15 text-[#D8A23D] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {appIdes.filter(i => i.appId === ide.appId).indexOf(ide) + 1}
                      </div>
                      <span className="text-sm">{ide.appEmoji}</span>
                      <div className="flex-1">
                        <div className="text-xs text-[#E7E2DC]">{ide.teks}</div>
                        <div className="text-[10px] text-[#8A8378] mt-0.5">{new Date(ide.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {ide.appName}</div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#D8A23D]/15 text-[#D8A23D]">{ide.appEmoji} {ide.appName}</span>
                      <button onClick={() => hapusIde(ide.id)} className="text-[#F87171] text-[11px] opacity-60 hover:opacity-100">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingIdes.length === 0 && (
              <div className="text-center py-6 text-[#8A8378] text-xs">Belum ada ide pending. Tambahkan di atas.</div>
            )}
          </div>

          {/* How it works */}
          <div className="rounded-lg bg-[#A78BFA]/5 border border-[#A78BFA]/15 p-4 mb-3.5">
            <p className="text-[10px] text-[#A78BFA] uppercase tracking-wide mb-2.5"> Cara Kerja Priority</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[#D8A23D] font-bold w-5">1.</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#D8A23D]/15 text-[#D8A23D]" style={{ minWidth: 50, textAlign: 'center' }}>App</span>
                <span className="text-[#8A8378]">→ Ambil ide oldest pending untuk app ini</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[#D8A23D] font-bold w-5">2.</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#60A5FA]/15 text-[#60A5FA]" style={{ minWidth: 50, textAlign: 'center' }}>Global</span>
                <span className="text-[#8A8378]">→ Kalau app kosong, ambil dari global pool</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[#D8A23D] font-bold w-5">3.</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-[#8A8378]" style={{ minWidth: 50, textAlign: 'center' }}>Auto</span>
                <span className="text-[#8A8378]">→ Kalau dua-duanya kosong, Gemini generate tema random</span>
              </div>
            </div>
          </div>

          {/* Used ides */}
          {usedIdes.length > 0 && (
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4">
              <p className="text-[10px] text-[#8A8378] uppercase tracking-wide mb-3"> Sudah Dipakai ({usedIdes.length})</p>
              <div className="flex flex-col gap-1.5">
                {usedIdes.slice(0, 5).map(ide => (
                  <div key={ide.id} className="flex items-center gap-2.5 px-2.5 py-2 bg-white/[0.02] border border-white/10 rounded-md opacity-45">
                    <span className="text-sm">{ide.appEmoji}</span>
                    <div className="flex-1">
                      <div className="text-xs text-[#E7E2DC] line-through">{ide.teks}</div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-[#8A8378]">used</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== TAB: FOTO ===== */}
      {tab === 'foto' && (
        <>
          {/* Upload */}
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4 mb-3.5">
            <p className="text-[10px] text-[#8A8378] uppercase tracking-wide mb-3">Upload Foto</p>
            <div className="flex items-center gap-3 mb-3">
              <label className="flex-1 border-2 border-dashed border-white/15 rounded-lg py-5 px-4 text-center cursor-pointer hover:border-[#D8A23D] hover:bg-[#D8A23D]/4 transition-all">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => setFotoFile(e.target.files?.[0] || null)}
                />
                <span className="text-2xl opacity-50 block mb-1">{fotoFile ? '✓' : '📷'}</span>
                <span className="text-xs text-[#CFC9BE] font-semibold">{fotoFile ? fotoFile.name : 'Drag foto atau klik'}</span>
                <span className="text-[10px] text-[#8A8378] block mt-0.5">JPG, PNG, WebP · max 2MB</span>
              </label>
            </div>

            {fotoFile && (
              <>
                <div className="mb-3">
                  <label className="text-[10px] text-[#8A8378] uppercase tracking-wide block mb-1.5">Tag Foto</label>
                  <div className="flex items-center gap-1.5 flex-wrap px-2.5 py-1.5 bg-white/5 border border-white/15 rounded-md min-h-[38px]">
                    {fotoTags.map(t => (
                      <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#D8A23D]/15 text-[#D8A23D] rounded-full text-[11px] font-semibold">
                        {t} <span className="cursor-pointer opacity-60 hover:opacity-100" onClick={() => setFotoTags(fotoTags.filter(x => x !== t))}>✕</span>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={fotoTagInput}
                      onChange={(e) => setFotoTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFotoTag() } }}
                      placeholder="Ketik tag + Enter..."
                      className="flex-1 min-w-[100px] bg-transparent border-none text-[13px] text-[#CFC9BE] outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-[10px] text-[#8A8378] self-center mr-1">Saran:</span>
                    {['kasir', 'gym', 'kamar', 'umkm', 'toko', 'sukses', 'tips', 'bengkel', 'restoran'].map(s => (
                      <button key={s} onClick={() => { if (!fotoTags.includes(s)) setFotoTags([...fotoTags, s]) }} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[10px] text-[#8A8378] hover:border-[#D8A23D] hover:text-[#D8A23D] cursor-pointer">+ {s}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-[#8A8378] uppercase tracking-wide">Assign ke App</label>
                    <select
                      value={fotoAppId}
                      onChange={(e) => setFotoAppId(e.target.value)}
                      className="bg-white/5 border border-white/15 rounded-md px-3 py-1.5 text-[13px] font-medium text-[#CFC9BE] outline-none cursor-pointer"
                    >
                      <option value=""> Global (semua app)</option>
                      {settings.apps.filter(a => a.punyaWeb).map(a => <option key={a.id} value={a.id}>{a.emoji} {a.nama}</option>)}
                    </select>
                  </div>
                  <button onClick={uploadFoto} className="ml-auto px-4 py-2 rounded-md bg-[#D8A23D] text-[#1C1917] text-xs font-bold cursor-pointer hover:bg-[#E3B458]">Upload Foto</button>
                </div>
              </>
            )}
          </div>

          {/* Foto grid */}
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4 mb-3.5">
            <p className="text-[10px] text-[#8A8378] uppercase tracking-wide mb-3">Galeri Foto ({fotos.length})</p>
            {fotos.length === 0 ? (
              <div className="text-center py-6 text-[#8A8378] text-xs">Belum ada foto. Upload di atas.</div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                {fotos.map(f => (
                  <div key={f.id} className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden hover:border-[#D8A23D]/30 transition-colors">
                    <div className="w-full relative" style={{ aspectRatio: '16/10' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.filename} className="w-full h-full object-cover" />
                      <button onClick={() => hapusFoto(f.id)} className="absolute top-1.5 right-1.5 bg-black/50 text-[#F87171] rounded px-1.5 py-0.5 text-[10px] opacity-60 hover:opacity-100">✕</button>
                      <div className="absolute bottom-1.5 left-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${f.appId ? 'bg-[#D8A23D]/15 text-[#D8A23D]' : 'bg-[#60A5FA]/15 text-[#60A5FA]'}`}>
                          {f.appEmoji} {f.appName || 'Global'}
                        </span>
                      </div>
                    </div>
                    <div className="p-2">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {f.tags.map(t => <span key={t} className="px-1.5 py-0.5 bg-[#D8A23D]/12 text-[#D8A23D] rounded text-[10px] font-semibold">{t}</span>)}
                      </div>
                      <div className="text-[10px] text-[#8A8378]">{f.useCount > 0 ? `Dipakai ${f.useCount}×` : 'Belum dipakai'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Match priority */}
          <div className="rounded-lg bg-[#A78BFA]/5 border border-[#A78BFA]/15 p-4">
            <p className="text-[10px] text-[#A78BFA] uppercase tracking-wide mb-2.5"> Cara Pilih Foto (LRU)</p>
            <div className="flex flex-col gap-1.5">
              {[
                { n: 1, label: 'App + tag cocok', desc: 'Foto app ini, tag match topik. LRU pick.', color: '#D8A23D' },
                { n: 2, label: 'App, tag apa saja', desc: 'Foto app ini, tag tidak match. LRU pick.', color: '#D8A23D' },
                { n: 3, label: 'Global + tag cocok', desc: 'Foto global, tag match topik. LRU pick.', color: '#60A5FA' },
                { n: 4, label: 'Global random', desc: 'Tidak ada tag match. Global LRU pick.', color: '#60A5FA' },
                { n: 5, label: 'Tanpa foto', desc: 'Pool kosong. Artikel tanpa foto header.', color: '#8A8378' },
              ].map(s => (
                <div key={s.n} className="flex items-center gap-2.5 py-1.5 border-b border-white/5 last:border-0">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: s.color + '20', color: s.color }}>{s.n}</div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-[#E7E2DC]">{s.label}</div>
                    <div className="text-[11px] text-[#8A8378]">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {saving && <div className="fixed bottom-4 right-4 px-3 py-1.5 bg-[#D8A23D] text-[#1C1917] text-xs font-semibold rounded-md">Menyimpan...</div>}
    </div>
  )
}
