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
  stats: { publishedCount: number; draftCount: number; failedCount: number }
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
  createdAt: string
}

const JAM_OPTIONS = ['06:00', '07:00', '08:00', '09:00', '12:00']

export default function ArtikelOtomatisPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [riwayat, setRiwayat] = useState<RiwayatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genStatus, setGenStatus] = useState('')

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

  useEffect(() => { muat() }, [muat])

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
        setGenStatus(`Selesai: ${data.ok || 0} published, ${data.fail || 0} failed`)
      } else {
        setGenStatus('Gagal: ' + (data.error || 'unknown'))
      }
    } catch {
      setGenStatus('Gagal: network error')
    }
    setTimeout(() => { setGenerating(false); setGenStatus(''); muat() }, 3000)
  }

  if (loading || !settings) {
    return <div className="p-6 text-sm text-[#8A8378]">Memuat...</div>
  }

  const activeCount = settings.apps.filter(a => a.artikelAktif).length

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
            <label className="text-[10px] text-[#8A8378] uppercase tracking-wide">App Aktif</label>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#D8A23D]/15 rounded-md text-xs">
              <span className="text-[#D8A23D] font-bold text-sm">{activeCount}</span>
              <span className="text-[#8A8378]">dari {settings.apps.length} app</span>
            </div>
          </div>
          {generating && (
            <div className="flex items-center gap-2 px-3.5 py-2 bg-[#D8A23D]/15 rounded-md text-xs text-[#D8A23D]">
              <div className="w-3.5 h-3.5 border-2 border-[#D8A23D]/30 border-t-[#D8A23D] rounded-full animate-spin" />
              <span>{genStatus || 'Generating...'}</span>
            </div>
          )}
          <button
            onClick={generateSemua}
            disabled={generating}
            className="ml-auto px-4 py-2 rounded-md bg-[#D8A23D] text-[#1C1917] text-xs font-bold cursor-pointer hover:bg-[#E3B458] disabled:opacity-50 transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Semua Sekarang'}
          </button>
        </div>
      </div>

      {/* Tujuan Posting */}
      <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4 mb-3.5">
        <p className="text-[10px] text-[#8A8378] uppercase tracking-wide mb-3">Tujuan Posting</p>
        <div className="grid grid-cols-2 gap-4">
          {/* zomet.my.id */}
          <div className="bg-white/[0.02] border border-white/10 rounded-lg p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold bg-[#D8A23D]/15 text-[#D8A23D]">Z</div>
                <span>zomet.my.id</span>
              </div>
              <button
                onClick={() => simpanSettings({ tujuanZomet: !settings.tujuanZomet })}
                className={`relative w-[44px] h-[24px] rounded-full cursor-pointer transition-colors ${settings.tujuanZomet ? 'bg-[#4ADE80]/15' : 'bg-white/10'}`}
              >
                <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full transition-all ${settings.tujuanZomet ? 'left-[23px] bg-[#4ADE80]' : 'left-[3px] bg-[#8A8378]'}`} />
              </button>
            </div>
            <p className="text-[11px] text-[#8A8378] leading-relaxed">
              Push markdown ke repo <code className="bg-white/[0.06] px-1 py-0.5 rounded text-[10px] text-[#CFC9BE]">djvpri/zomet-main</code><br />
              Live di <code className="bg-white/[0.06] px-1 py-0.5 rounded text-[10px] text-[#CFC9BE]">zomet.my.id/artikel/...</code>
            </p>
            <div className="flex gap-3 mt-2 text-[11px]">
              <span className="flex items-center gap-1 text-[#8A8378]"><span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80]" /> GitHub Token OK</span>
              <span className="flex items-center gap-1 text-[#8A8378]"><span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80]" /> Repo connected</span>
            </div>
          </div>
          {/* Landing page app */}
          <div className="bg-white/[0.02] border border-white/10 rounded-lg p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold bg-[#60A5FA]/15 text-[#60A5FA]">A</div>
                <span>Landing Page App</span>
              </div>
              <button
                onClick={() => simpanSettings({ tujuanApp: !settings.tujuanApp })}
                className={`relative w-[44px] h-[24px] rounded-full cursor-pointer transition-colors ${settings.tujuanApp ? 'bg-[#4ADE80]/15' : 'bg-white/10'}`}
              >
                <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full transition-all ${settings.tujuanApp ? 'left-[23px] bg-[#4ADE80]' : 'left-[3px] bg-[#8A8378]'}`} />
              </button>
            </div>
            <p className="text-[11px] text-[#8A8378] leading-relaxed">
              Artikel di <code className="bg-white/[0.06] px-1 py-0.5 rounded text-[10px] text-[#CFC9BE]">/blog</code> tiap app via Zadv API<br />
              <span className="text-[#8A8378] text-[10px]">GET /api/artikel/publik?appId=X — CORS: *.zomet.my.id</span>
            </p>
          </div>
        </div>
      </div>

      {/* App Aktif List */}
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
              <div className="flex gap-1">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${settings.tujuanZomet ? 'bg-[#D8A23D]/15 text-[#D8A23D]' : 'bg-white/5 text-[#8A8378]'}`}>zomet</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${app.punyaWeb && settings.tujuanApp ? 'bg-[#60A5FA]/15 text-[#60A5FA]' : 'bg-white/5 text-[#8A8378]'}`}>/blog</span>
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
              <th className="text-left text-[10px] uppercase tracking-wide text-[#8A8378] px-2 py-1.5 border-b border-white/10">Tanggal</th>
              <th className="text-left text-[10px] uppercase tracking-wide text-[#8A8378] px-2 py-1.5 border-b border-white/10">App</th>
              <th className="text-left text-[10px] uppercase tracking-wide text-[#8A8378] px-2 py-1.5 border-b border-white/10">Judul</th>
              <th className="text-left text-[10px] uppercase tracking-wide text-[#8A8378] px-2 py-1.5 border-b border-white/10">Status</th>
              <th className="text-left text-[10px] uppercase tracking-wide text-[#8A8378] px-2 py-1.5 border-b border-white/10">Tujuan</th>
              <th className="px-2 py-1.5 border-b border-white/10"></th>
            </tr>
          </thead>
          <tbody>
            {riwayat.length === 0 && (
              <tr><td colSpan={6} className="px-2 py-4 text-center text-[#8A8378] text-xs">Belum ada artikel.</td></tr>
            )}
            {riwayat.map(a => {
              const tanggal = a.publishedAt || a.createdAt
              const tgl = new Date(tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
              const jam = new Date(tanggal).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              return (
                <tr key={a.id} className="hover:bg-white/[0.02]">
                  <td className="px-2 py-2 text-xs text-[#8A8378] whitespace-nowrap">{tgl} {jam}</td>
                  <td className="px-2 py-2 text-xs whitespace-nowrap">{a.appEmoji} {a.appName}</td>
                  <td className="px-2 py-2 text-xs text-[#E7E2DC] max-w-[200px] truncate">{a.judul}</td>
                  <td className="px-2 py-2 text-xs">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                      a.status === 'published' ? 'bg-[#4ADE80]/15 text-[#4ADE80]' :
                      a.status === 'draft' ? 'bg-[#FBBF24]/15 text-[#FBBF24]' :
                      'bg-[#F87171]/15 text-[#F87171]'
                    }`}>
                      {a.status === 'published' ? '✓ Published' : a.status === 'draft' ? '◐ Draft' : '✕ Failed'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <div className="flex gap-1">
                      {a.status === 'published' ? (
                        <>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#D8A23D]/15 text-[#D8A23D]">zomet</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#60A5FA]/15 text-[#60A5FA]">app</span>
                        </>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-[#8A8378]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {a.status === 'published' ? (
                      <a href={`https://www.zomet.my.id/artikel/${a.slug}`} target="_blank" rel="noopener" className="text-[#D8A23D] text-[11px] hover:underline">Lihat →</a>
                    ) : a.status === 'failed' ? (
                      <button className="px-2 py-0.5 bg-[#F87171]/15 text-[#F87171] rounded text-[10px] font-semibold cursor-pointer hover:bg-[#F87171]/20">Retry</button>
                    ) : (
                      <a href={`/app/artikel?draft=${a.id}`} className="text-[#D8A23D] text-[11px] hover:underline">Edit →</a>
                    )}
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
          <span className="flex items-center gap-1.5 text-[11px]"><span className="w-2 h-2 rounded-full bg-[#4ADE80]" /><span className="text-[#8A8378]">Zadv Public API</span></span>
          <div className="ml-auto flex gap-5">
            <span className="text-[11px] text-[#8A8378]">Bulan ini: <strong className="text-[#E7E2DC] font-semibold">{settings.stats.publishedCount} published</strong></span>
            <span className="text-[11px] text-[#8A8378]"><strong className="text-[#E7E2DC] font-semibold">{settings.stats.draftCount} draft</strong></span>
            <span className="text-[11px] text-[#8A8378]"><strong className="text-[#E7E2DC] font-semibold">{settings.stats.failedCount} failed</strong></span>
          </div>
        </div>
      </div>

      {saving && <div className="fixed bottom-4 right-4 px-3 py-1.5 bg-[#D8A23D] text-[#1C1917] text-xs font-semibold rounded-md">Menyimpan...</div>}
    </div>
  )
}
