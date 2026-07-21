'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

interface LogEntry {
  nomor: string
  status: 'mengirim' | 'terkirim' | 'gagal'
  pesan?: string
}

interface WaGrup {
  id: number
  nama: string
  nomor: string[]
  createdAt: string
}

interface WaTemplate {
  id: number
  judul: string
  teks: string
  createdAt: string
}

function normalisiNomor(raw: string): string {
  const n = raw.trim().replace(/\D/g, '')
  if (n.startsWith('0')) return '62' + n.slice(1)
  if (n.startsWith('62')) return n
  return '62' + n
}

function parseNomor(teks: string): string[] {
  return teks
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(normalisiNomor)
    .filter(n => n.length >= 10)
}

const DELAY_OPTS = [
  { val: 3, label: '3 detik' },
  { val: 5, label: '5 detik' },
  { val: 8, label: '8 detik' },
  { val: 12, label: '12 detik' },
]

export default function WAMassal() {
  const [token, setToken] = useState('')
  const [tokenSimpan, setTokenSimpan] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [hasEnvToken, setHasEnvToken] = useState(false)
  const [nomorRaw, setNomorRaw] = useState('')
  const [pesan, setPesan] = useState('')
  const [delay, setDelay] = useState(5)
  const [log, setLog] = useState<LogEntry[]>([])
  const [berjalan, setBerjalan] = useState(false)
  const [selesai, setSelesai] = useState(false)
  const batalRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Grup & Template state
  const [grups, setGrups] = useState<WaGrup[]>([])
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [namaGrup, setNamaGrup] = useState('')
  const [namaTemplate, setNamaTemplate] = useState('')
  const [showSimpanGrup, setShowSimpanGrup] = useState(false)
  const [showSimpanTemplate, setShowSimpanTemplate] = useState(false)
  const [simpanGrupLoading, setSimpanGrupLoading] = useState(false)
  const [simpanTemplateLoading, setSimpanTemplateLoading] = useState(false)

  const muatData = useCallback(async () => {
    const [g, t] = await Promise.all([
      fetch('/api/wa-massal/grup').then(r => r.json()),
      fetch('/api/wa-massal/template').then(r => r.json()),
    ])
    setGrups(Array.isArray(g) ? g : [])
    setTemplates(Array.isArray(t) ? t : [])
  }, [])

  useEffect(() => {
    fetch('/api/wa-massal').then(r => r.json()).then(d => setHasEnvToken(!!d.hasEnvToken))
    const saved = localStorage.getItem('zadv_fonnte_token')
    if (saved) { setToken(saved); setTokenSimpan(true) }
    muatData()
  }, [muatData])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  function simpanToken() {
    if (tokenSimpan) localStorage.setItem('zadv_fonnte_token', token)
    else localStorage.removeItem('zadv_fonnte_token')
  }

  function updateLog(nomor: string, patch: Partial<LogEntry>) {
    setLog(prev => prev.map(l => l.nomor === nomor ? { ...l, ...patch } : l))
  }

  async function simpanGrup() {
    const daftar = parseNomor(nomorRaw)
    if (!namaGrup.trim() || daftar.length === 0) return
    setSimpanGrupLoading(true)
    await fetch('/api/wa-massal/grup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama: namaGrup.trim(), nomor: daftar }),
    })
    setNamaGrup('')
    setShowSimpanGrup(false)
    setSimpanGrupLoading(false)
    muatData()
  }

  async function hapusGrup(id: number) {
    await fetch(`/api/wa-massal/grup/${id}`, { method: 'DELETE' })
    muatData()
  }

  async function simpanTemplate() {
    if (!namaTemplate.trim() || !pesan.trim()) return
    setSimpanTemplateLoading(true)
    await fetch('/api/wa-massal/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ judul: namaTemplate.trim(), teks: pesan }),
    })
    setNamaTemplate('')
    setShowSimpanTemplate(false)
    setSimpanTemplateLoading(false)
    muatData()
  }

  async function hapusTemplate(id: number) {
    await fetch(`/api/wa-massal/template/${id}`, { method: 'DELETE' })
    muatData()
  }

  async function kirim() {
    const daftar = parseNomor(nomorRaw)
    if (!token.trim() && !hasEnvToken) return alert('Masukkan Fonnte API token terlebih dahulu.')
    if (daftar.length === 0) return alert('Nomor tujuan tidak valid.')
    if (!pesan.trim()) return alert('Pesan tidak boleh kosong.')

    simpanToken()
    batalRef.current = false
    setBerjalan(true)
    setSelesai(false)
    setLog(daftar.map(n => ({ nomor: n, status: 'mengirim' })))

    for (let i = 0; i < daftar.length; i++) {
      if (batalRef.current) break
      const nomor = daftar[i]

      try {
        const res = await fetch('/api/wa-massal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token.trim(), target: nomor, message: pesan }),
        })
        const data = await res.json()
        updateLog(nomor, {
          status: data.ok ? 'terkirim' : 'gagal',
          pesan: data.ok ? undefined : data.reason,
        })
      } catch {
        updateLog(nomor, { status: 'gagal', pesan: 'Koneksi error' })
      }

      if (i < daftar.length - 1 && !batalRef.current) {
        await new Promise(r => setTimeout(r, delay * 1000))
      }
    }

    setBerjalan(false)
    setSelesai(true)
  }

  function batal() {
    batalRef.current = true
    setBerjalan(false)
  }

  const daftar = parseNomor(nomorRaw)
  const terkirim = log.filter(l => l.status === 'terkirim').length
  const gagal = log.filter(l => l.status === 'gagal').length
  const mengirim = log.filter(l => l.status === 'mengirim').length

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">

      {/* Kolom kiri — form */}
      <div className="flex flex-col gap-5">

        {/* Token Fonnte */}
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378]">FONNTE API TOKEN</p>
            {!hasEnvToken && (
              <a
                href="https://fonnte.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10.5px] text-[#D8A23D] hover:underline"
              >
                Daftar Fonnte →
              </a>
            )}
          </div>

          {hasEnvToken ? (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-emerald-400 shrink-0">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
              <div>
                <p className="text-[12.5px] text-emerald-400 font-medium">Token terkonfigurasi</p>
                <p className="text-[10.5px] text-[#8A8378] mt-0.5">Diambil dari environment variable <code className="font-mono">FONNTE_TOKEN</code></p>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="Tempel token dari dashboard Fonnte..."
                  className="w-full bg-[#161311] border border-white/15 rounded-md px-3 py-2.5 text-[13px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50 pr-20"
                />
                <button
                  onClick={() => setShowToken(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#8A8378] hover:text-white"
                >
                  {showToken ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              <label className="flex items-center gap-2 mt-2.5 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={tokenSimpan}
                  onChange={e => setTokenSimpan(e.target.checked)}
                  className="accent-[#D8A23D]"
                />
                <span className="text-[11.5px] text-[#8A8378]">Simpan token di browser ini</span>
              </label>
            </>
          )}
        </div>

        {/* Nomor tujuan */}
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378]">NOMOR TUJUAN</p>
            <div className="flex items-center gap-2">
              {daftar.length > 0 && (
                <span className="text-[10.5px] text-[#D8A23D] font-medium">{daftar.length} nomor</span>
              )}
              {grups.length > 0 && (
                <select
                  onChange={e => {
                    const g = grups.find(x => x.id === parseInt(e.target.value))
                    if (g) setNomorRaw(g.nomor.map(n => n.startsWith('62') ? '0' + n.slice(2) : n).join('\n'))
                    e.target.value = ''
                  }}
                  defaultValue=""
                  className="text-[11px] bg-[#161311] border border-white/15 rounded px-2 py-1 text-[#B3ACA1] outline-none cursor-pointer hover:border-white/30"
                >
                  <option value="" disabled>Muat grup...</option>
                  {grups.map(g => (
                    <option key={g.id} value={g.id}>{g.nama} ({g.nomor.length})</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <textarea
            value={nomorRaw}
            onChange={e => setNomorRaw(e.target.value)}
            rows={6}
            placeholder={'08123456789\n08987654321\n62811222333\n\nSatu nomor per baris. Format 08xx / 628xx otomatis dikenali.'}
            className="w-full bg-[#161311] border border-white/15 rounded-md px-3 py-2.5 text-[13px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50 resize-none font-mono"
          />
          {daftar.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {daftar.slice(0, 8).map(n => (
                <span key={n} className="text-[10px] font-mono bg-white/[0.05] border border-white/10 px-2 py-0.5 rounded text-[#B3ACA1]">
                  +{n}
                </span>
              ))}
              {daftar.length > 8 && (
                <span className="text-[10px] text-[#8A8378] px-2 py-0.5">+{daftar.length - 8} lainnya</span>
              )}
            </div>
          )}
          {daftar.length > 0 && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              {!showSimpanGrup ? (
                <button
                  onClick={() => setShowSimpanGrup(true)}
                  className="text-[11.5px] text-[#8A8378] hover:text-[#D8A23D] transition-colors"
                >
                  + Simpan sebagai grup kontak
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={namaGrup}
                    onChange={e => setNamaGrup(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && simpanGrup()}
                    placeholder="Nama grup..."
                    className="flex-1 bg-[#161311] border border-white/15 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50"
                  />
                  <button
                    onClick={simpanGrup}
                    disabled={simpanGrupLoading || !namaGrup.trim()}
                    className="px-3 py-1.5 rounded bg-[#D8A23D] text-[#1C1917] text-[12px] font-medium hover:bg-[#C89230] disabled:opacity-50 transition-colors"
                  >
                    Simpan
                  </button>
                  <button
                    onClick={() => { setShowSimpanGrup(false); setNamaGrup('') }}
                    className="px-2 py-1.5 rounded border border-white/15 text-[12px] text-[#8A8378] hover:text-white transition-colors"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pesan */}
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378]">PESAN</p>
            <div className="flex items-center gap-2">
              <span className={`text-[10.5px] ${pesan.length > 4000 ? 'text-red-400' : 'text-[#8A8378]'}`}>
                {pesan.length} karakter
              </span>
              {templates.length > 0 && (
                <select
                  onChange={e => {
                    const t = templates.find(x => x.id === parseInt(e.target.value))
                    if (t) setPesan(t.teks)
                    e.target.value = ''
                  }}
                  defaultValue=""
                  className="text-[11px] bg-[#161311] border border-white/15 rounded px-2 py-1 text-[#B3ACA1] outline-none cursor-pointer hover:border-white/30"
                >
                  <option value="" disabled>Muat template...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.judul}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <textarea
            value={pesan}
            onChange={e => setPesan(e.target.value)}
            rows={8}
            placeholder={"Tulis pesan promosi di sini...\n\nAtau generate dulu di tab Z Adv, lalu salin ke sini."}
            className="w-full bg-[#161311] border border-white/15 rounded-md px-3 py-2.5 text-[13px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50 resize-none leading-relaxed"
          />
          {pesan.trim() && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              {!showSimpanTemplate ? (
                <button
                  onClick={() => setShowSimpanTemplate(true)}
                  className="text-[11.5px] text-[#8A8378] hover:text-[#D8A23D] transition-colors"
                >
                  + Simpan sebagai template pesan
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={namaTemplate}
                    onChange={e => setNamaTemplate(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && simpanTemplate()}
                    placeholder="Judul template..."
                    className="flex-1 bg-[#161311] border border-white/15 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50"
                  />
                  <button
                    onClick={simpanTemplate}
                    disabled={simpanTemplateLoading || !namaTemplate.trim()}
                    className="px-3 py-1.5 rounded bg-[#D8A23D] text-[#1C1917] text-[12px] font-medium hover:bg-[#C89230] disabled:opacity-50 transition-colors"
                  >
                    Simpan
                  </button>
                  <button
                    onClick={() => { setShowSimpanTemplate(false); setNamaTemplate('') }}
                    className="px-2 py-1.5 rounded border border-white/15 text-[12px] text-[#8A8378] hover:text-white transition-colors"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Delay & tombol kirim */}
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-5">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-3">JEDA ANTAR PESAN</p>
          <div className="flex gap-1.5 mb-4">
            {DELAY_OPTS.map(d => (
              <button
                key={d.val}
                onClick={() => setDelay(d.val)}
                className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors ${
                  delay === d.val
                    ? 'bg-[#D8A23D] text-[#1C1917] border-[#D8A23D] font-medium'
                    : 'border-white/15 text-[#B3ACA1] hover:border-white/30'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {!berjalan ? (
            <button
              onClick={kirim}
              disabled={(!token && !hasEnvToken) || daftar.length === 0 || !pesan.trim()}
              className="w-full py-3 rounded-md bg-[#25D366] text-white text-[13px] font-bold hover:bg-[#20BD5A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Kirim ke {daftar.length} Nomor
            </button>
          ) : (
            <button
              onClick={batal}
              className="w-full py-3 rounded-md bg-red-600 text-white text-[13px] font-bold hover:bg-red-500 transition-colors"
            >
              Batalkan Pengiriman
            </button>
          )}
        </div>
      </div>

      {/* Kolom kanan */}
      <div className="flex flex-col gap-4">

        {/* Estimasi waktu */}
        {daftar.length > 0 && !berjalan && !selesai && (
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-2">ESTIMASI</p>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[12px]">
                <span className="text-[#8A8378]">Jumlah nomor</span>
                <span className="font-medium">{daftar.length}</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-[#8A8378]">Jeda</span>
                <span className="font-medium">{delay} detik/pesan</span>
              </div>
              <div className="flex justify-between text-[12px] border-t border-white/10 pt-1.5 mt-0.5">
                <span className="text-[#8A8378]">Total waktu</span>
                <span className="font-medium text-[#D8A23D]">
                  ~{Math.ceil((daftar.length * delay) / 60)} menit
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Progress */}
        {(berjalan || selesai) && log.length > 0 && (
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378]">PROGRESS</p>
              {berjalan && (
                <span className="flex items-center gap-1.5 text-[10.5px] text-[#D8A23D]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D8A23D] animate-pulse" />
                  Mengirim...
                </span>
              )}
              {selesai && (
                <span className="text-[10.5px] text-emerald-400 font-medium">Selesai</span>
              )}
            </div>

            <div className="h-1.5 bg-white/10 rounded-full mb-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#25D366] transition-all duration-500"
                style={{ width: `${log.length > 0 ? ((terkirim + gagal) / log.length) * 100 : 0}%` }}
              />
            </div>

            <div className="flex gap-3 mb-3 text-[11.5px]">
              <span className="text-emerald-400">{terkirim} terkirim</span>
              {gagal > 0 && <span className="text-red-400">{gagal} gagal</span>}
              {mengirim > 0 && <span className="text-[#8A8378]">{mengirim} menunggu</span>}
            </div>

            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {log.map((l, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/[0.05] last:border-0">
                  <div className="shrink-0 mt-0.5">
                    {l.status === 'mengirim' && (
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-[#D8A23D] border-t-transparent animate-spin inline-block" />
                    )}
                    {l.status === 'terkirim' && (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-emerald-400">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    )}
                    {l.status === 'gagal' && (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-red-400">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11.5px] font-mono text-[#B3ACA1]">+{l.nomor}</div>
                    {l.pesan && (
                      <div className="text-[10.5px] text-red-400 mt-0.5 truncate">{l.pesan}</div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Grup tersimpan */}
        {grups.length > 0 && (
          <div className="rounded-lg bg-white/[0.02] border border-white/[0.07] p-4">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-3">GRUP KONTAK</p>
            <div className="flex flex-col gap-1.5">
              {grups.map(g => (
                <div key={g.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => setNomorRaw(g.nomor.map(n => n.startsWith('62') ? '0' + n.slice(2) : n).join('\n'))}
                    className="flex-1 text-left flex items-center justify-between px-3 py-2 rounded bg-white/[0.04] hover:bg-white/[0.08] transition-colors border border-white/[0.06]"
                  >
                    <span className="text-[12px] text-[#E7E2DC] truncate">{g.nama}</span>
                    <span className="text-[10.5px] text-[#8A8378] ml-2 shrink-0">{g.nomor.length} nomor</span>
                  </button>
                  <button
                    onClick={() => hapusGrup(g.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/20 text-[#8A8378] hover:text-red-400 transition-all"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Template tersimpan */}
        {templates.length > 0 && (
          <div className="rounded-lg bg-white/[0.02] border border-white/[0.07] p-4">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-3">TEMPLATE PESAN</p>
            <div className="flex flex-col gap-1.5">
              {templates.map(t => (
                <div key={t.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => setPesan(t.teks)}
                    className="flex-1 text-left px-3 py-2 rounded bg-white/[0.04] hover:bg-white/[0.08] transition-colors border border-white/[0.06]"
                  >
                    <div className="text-[12px] text-[#E7E2DC] truncate">{t.judul}</div>
                    <div className="text-[10.5px] text-[#8A8378] truncate mt-0.5">{t.teks.slice(0, 50)}{t.teks.length > 50 ? '...' : ''}</div>
                  </button>
                  <button
                    onClick={() => hapusTemplate(t.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/20 text-[#8A8378] hover:text-red-400 transition-all"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Panduan */}
        {!berjalan && !selesai && grups.length === 0 && templates.length === 0 && (
          <div className="rounded-lg bg-white/[0.02] border border-white/[0.07] p-4">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-3">PANDUAN</p>
            <ol className="flex flex-col gap-2">
              {[
                'Daftar di fonnte.com → salin API token',
                'Masukkan nomor tujuan, lalu simpan sebagai grup',
                'Generate caption di tab Z Adv, lalu simpan sebagai template',
                'Pilih jeda antar pesan (minimal 3 detik)',
                'Klik Kirim dan pantau progress',
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[11.5px] text-[#8A8378]">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] font-bold text-[#D8A23D] mt-0.5">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
            <p className="text-[10px] text-[#4A453D] mt-3 leading-relaxed">
              Gunakan jeda yang cukup agar nomor pengirim tidak diblokir WA. Disarankan minimal 5 detik.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
