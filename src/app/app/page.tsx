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

function jamCetak() {
  const d = new Date()
  return (
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) +
    ' · ' +
    d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
  )
}

export default function MejaCetak() {
  const [apps, setApps] = useState<PromoApp[]>([])
  const [loadingApps, setLoadingApps] = useState(true)
  const [terpilih, setTerpilih] = useState<PromoApp | null>(null)
  const [platform, setPlatform] = useState('instagram')
  const [tone, setTone] = useState('santai')
  const [struk, setStruk] = useState<{ teks: string; jam: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [disalin, setDisalin] = useState(false)
  const [error, setError] = useState('')

  const muatApps = useCallback(async () => {
    setLoadingApps(true)
    try {
      const res = await fetch('/api/apps')
      const data = await res.json()
      setApps(data)
      if (data.length > 0) setTerpilih((prev) => prev ?? data[0])
    } catch {
      setError('Gagal memuat daftar app')
    } finally {
      setLoadingApps(false)
    }
  }, [])

  useEffect(() => { muatApps() }, [muatApps])

  async function cetak(variasiLain: boolean) {
    if (!terpilih) return
    setLoading(true)
    setError('')
    setDisalin(false)
    try {
      const res = await fetch('/api/generate/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: terpilih.id, platform, tone, variasiLain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal')
      setStruk({ teks: data.teks, jam: jamCetak() })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal cetak caption')
    } finally {
      setLoading(false)
    }
  }

  function salin() {
    if (!struk) return
    navigator.clipboard?.writeText(struk.teks).catch(() => {})
    setDisalin(true)
    setTimeout(() => setDisalin(false), 1800)
  }

  function pilihApp(app: PromoApp) {
    setTerpilih(app)
    setStruk(null)
    setError('')
  }

  if (loadingApps) {
    return <p className="text-[#8A8378] text-sm">Memuat...</p>
  }

  if (apps.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-[#8A8378] text-sm mb-3">Belum ada app terdaftar.</p>
        <a href="/app/kelola" className="text-[#D8A23D] text-sm font-medium hover:underline">
          Tambah app pertama →
        </a>
      </div>
    )
  }

  if (!terpilih) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      {/* Rak tiket app */}
      <div>
        <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-3 px-1">PILIH PRODUK</p>
        <div className="flex flex-col gap-1.5">
          {apps.map((app) => {
            const aktif = app.id === terpilih.id
            return (
              <button
                key={app.id}
                onClick={() => pilihApp(app)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left transition-all border ${
                  aktif ? 'bg-white/[0.07] border-white/20' : 'border-transparent hover:bg-white/[0.04]'
                }`}
              >
                <span className="text-lg shrink-0">{app.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{app.nama}</div>
                  <div className="text-[10.5px] text-[#8A8378] truncate">{app.tagline}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Meja kerja */}
      <div className="flex flex-col gap-5">
        <div
          className="rounded-lg p-5 border-l-[3px]"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderColor: terpilih.accent }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{terpilih.emoji}</span>
              <div>
                <div className="text-[17px] font-bold">{terpilih.nama}</div>
                <div className="text-[12px] text-[#B3ACA1]">{terpilih.tagline}</div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[13px] font-semibold" style={{ color: terpilih.accent }}>Rp 100rb/bln</div>
              <div className="text-[10px] text-[#8A8378]">atau Rp 1jt/thn</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {terpilih.fitur.map((f) => (
              <span key={f} className="text-[10.5px] px-2 py-1 rounded-full bg-white/[0.06] text-[#CFC9BE]">
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-5">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-3">ATUR CETAKAN</p>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[11px] text-[#8A8378] mb-1.5">Platform</p>
              <div className="flex gap-1.5">
                {PLATFORM.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors ${
                      platform === p.id
                        ? 'bg-[#D8A23D] text-[#1C1917] border-[#D8A23D] font-medium'
                        : 'border-white/15 text-[#B3ACA1] hover:border-white/30'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-[#8A8378] mb-1.5">Nada bicara</p>
              <div className="flex gap-1.5">
                {TONE.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors ${
                      tone === t.id
                        ? 'bg-[#D8A23D] text-[#1C1917] border-[#D8A23D] font-medium'
                        : 'border-white/15 text-[#B3ACA1] hover:border-white/30'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => cetak(false)}
            disabled={loading}
            className="mt-4 w-full py-2.5 rounded-md bg-[#D8A23D] text-[#1C1917] text-[13px] font-semibold hover:bg-[#E3B458] disabled:opacity-60 transition-colors"
          >
            {loading ? 'Mencetak caption...' : '✨ Cetak Caption'}
          </button>
          {error && <p className="text-[11px] text-red-400 mt-2">{error}</p>}
        </div>

        {struk && (
          <div className="rounded-lg bg-[#F3EFE7] text-[#2B2622] p-5 relative shadow-lg">
            <div
              className="absolute -top-1.5 left-4 right-4 h-2 opacity-30"
              style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 6px, #2B2622 6px, #2B2622 8px)' }}
            />
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-dashed border-[#2B2622]/25">
              <div className="text-[10.5px] font-mono text-[#6B6459]">
                ⚡ {terpilih.nama} · {PLATFORM.find((p) => p.id === platform)?.label}
              </div>
              <span className="text-[10.5px] font-mono text-[#6B6459]">{struk.jam}</span>
            </div>
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap font-mono">{struk.teks}</p>
            <div className="mt-4 pt-3 border-t border-dashed border-[#2B2622]/25 flex gap-2">
              <button
                onClick={salin}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#2B2622] text-[#F3EFE7] text-[11.5px] font-medium hover:opacity-85 transition-opacity"
              >
                {disalin ? '✓ Tersalin' : '📋 Salin Teks'}
              </button>
              <button
                onClick={() => cetak(true)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#2B2622]/30 text-[#2B2622] text-[11.5px] font-medium hover:bg-[#2B2622]/5 transition-colors disabled:opacity-50"
              >
                🔄 Versi Lain
              </button>
            </div>
          </div>
        )}

        <div>
          <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-3">POSTER</p>
          <div
            className="rounded-lg aspect-square max-w-[280px] p-6 flex flex-col justify-between relative overflow-hidden"
            style={{ backgroundColor: terpilih.tint }}
          >
            <div
              className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-10"
              style={{ backgroundColor: terpilih.accent }}
            />
            <div>
              <span className="text-4xl">{terpilih.emoji}</span>
              <div className="text-[19px] font-bold mt-2 leading-tight" style={{ color: terpilih.accent }}>
                {terpilih.nama}
              </div>
              <div className="text-[11px] text-[#4A453D] mt-0.5">{terpilih.tagline}</div>
            </div>
            <div className="flex flex-col gap-1">
              {terpilih.fitur.slice(0, 3).map((f) => (
                <div key={f} className="text-[9.5px] text-[#4A453D] flex items-center gap-1">
                  <span style={{ color: terpilih.accent }}>✓</span> {f}
                </div>
              ))}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[15px] font-bold" style={{ color: terpilih.accent }}>Rp 100.000</div>
                <div className="text-[9px] text-[#4A453D]">/bulan</div>
              </div>
              <div className="text-[9px] font-semibold px-2.5 py-1.5 rounded-full text-white" style={{ backgroundColor: terpilih.accent }}>
                Coba Sekarang
              </div>
            </div>
          </div>
          <a
            href={`/api/generate/poster?appId=${terpilih.id}`}
            download={`poster-${terpilih.nama.toLowerCase()}.png`}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.06] border border-white/15 text-[11.5px] font-medium text-[#CFC9BE] hover:bg-white/10 transition-colors"
          >
            ⬇️ Unduh Poster PNG
          </a>
        </div>
      </div>
    </div>
  )
}
