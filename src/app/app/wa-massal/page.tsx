'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

interface LogEntry {
  nomor: string
  status: 'mengirim' | 'terkirim' | 'gagal' | 'dilewati'
  pesan?: string
}
interface WaBlacklistItem { nomor: string; alasan: string | null; createdAt: string }
interface WaGrup { id: number; nama: string; nomor: string[] }
interface WaTemplate { id: number; judul: string; teks: string; mediaUrl?: string | null; mediaFilename?: string | null; mediaMime?: string | null }
interface WaKontak { id: number; nama: string; nomor: string[]; grup: string | null }
interface WaRiwayat { id: number; nomor: string; pesan: string; mediaUrl: string | null; status: string; alasan: string | null; sentAt: string }

function normalisiNomor(raw: string): string {
  const n = raw.trim().replace(/\D/g, '')
  if (n.startsWith('0')) return '62' + n.slice(1)
  if (n.startsWith('62')) return n
  return '62' + n
}

function parseNomor(teks: string): string[] {
  return teks.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean).map(normalisiNomor).filter(n => n.length >= 10)
}

function waktuRelatif(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} mnt lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} hari lalu`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

function MediaPreview({ mime, filename, url }: { mime: string; filename: string; url: string }) {
  const isImage = mime.startsWith('image/')
  const isPdf = mime === 'application/pdf'
  const isVideo = mime.startsWith('video/')
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]">
      {isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={filename} className="w-14 h-14 rounded object-cover shrink-0 bg-white/10" />
      )}
      {isPdf && (
        <div className="w-14 h-14 rounded bg-red-500/20 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-red-400">
            <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7H20.5v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/>
          </svg>
        </div>
      )}
      {isVideo && (
        <div className="w-14 h-14 rounded bg-blue-500/20 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-blue-400">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] text-[#E7E2DC] truncate font-medium">{filename}</p>
        <p className="text-[10.5px] text-[#8A8378] mt-0.5">{mime}</p>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-[#D8A23D] hover:underline break-all mt-1 block leading-relaxed">
          {url}
        </a>
      </div>
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-emerald-400 shrink-0">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    </div>
  )
}

const DELAY_OPTS = [
  { val: 3, label: '3 dtk' },
  { val: 5, label: '5 dtk' },
  { val: 8, label: '8 dtk' },
  { val: 12, label: '12 dtk' },
  { val: 3600, label: '1 jam' },
  { val: 7200, label: '2 jam' },
  { val: 10800, label: '3 jam' },
]

function formatDelay(detik: number): string {
  if (detik < 60) return `${detik} detik`
  if (detik < 3600) return `${Math.round(detik / 60)} menit`
  return `${detik / 3600} jam`
}

function formatDurasi(totalDetik: number): string {
  if (totalDetik < 60) return `~${totalDetik} detik`
  if (totalDetik < 3600) return `~${Math.ceil(totalDetik / 60)} menit`
  const jam = totalDetik / 3600
  return `~${Number.isInteger(jam) ? jam : jam.toFixed(1)} jam`
}

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

  // Grup & Template
  const [grups, setGrups] = useState<WaGrup[]>([])
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [namaGrup, setNamaGrup] = useState('')
  const [namaTemplate, setNamaTemplate] = useState('')
  const [showSimpanGrup, setShowSimpanGrup] = useState(false)
  const [showSimpanTemplate, setShowSimpanTemplate] = useState(false)
  const [simpanGrupLoading, setSimpanGrupLoading] = useState(false)
  const [simpanTemplateLoading, setSimpanTemplateLoading] = useState(false)

  // Kontak individual
  const [kontaks, setKontaks] = useState<WaKontak[]>([])
  const [filterGrup, setFilterGrup] = useState('')
  const [cariKontak, setCariKontak] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [kontakMap, setKontakMap] = useState<Map<string, { nama: string; grup: string | null }>>(new Map())
  const [showTambahKontak, setShowTambahKontak] = useState(false)
  const [formNama, setFormNama] = useState('')
  const [formNomors, setFormNomors] = useState([''])
  const [formGrup, setFormGrup] = useState('')
  const [tambahLoading, setTambahLoading] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editNama, setEditNama] = useState('')
  const [editNomors, setEditNomors] = useState<string[]>([''])
  const [editGrup, setEditGrup] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [activePanel, setActivePanel] = useState<'kontak' | 'grup' | 'template' | 'riwayat'>('kontak')
  // Cooldown & blacklist
  const [pakaiCooldown, setPakaiCooldown] = useState(true)
  const [cooldownHari, setCooldownHari] = useState(14)
  const [blacklist, setBlacklist] = useState<WaBlacklistItem[]>([])
  const [showBlacklist, setShowBlacklist] = useState(false)
  // Bulk kontak
  const [assignGrupVal, setAssignGrupVal] = useState('')
  const [assignGrupBaru, setAssignGrupBaru] = useState('')
  const [kelolaGrupLabel, setKelolaGrupLabel] = useState<string | null>(null)
  // GMaps import
  const [gmapsGrup, setGmapsGrup] = useState('')
  const [showGmaps, setShowGmaps] = useState(false)
  const [gmapsQ, setGmapsQ] = useState('')
  const [gmapsLoading, setGmapsLoading] = useState(false)
  const [gmapsHasil, setGmapsHasil] = useState<{ id: string; nama: string; nomor: string; nomorRaw: string; alamat: string }[]>([])
  const [gmapsPilih, setGmapsPilih] = useState<Set<string>>(new Set())
  const [gmapsImporting, setGmapsImporting] = useState(false)
  // TikTok import
  const [tiktokGrup, setTiktokGrup] = useState('')
  const [showTiktok, setShowTiktok] = useState(false)
  const [tiktokMode, setTiktokMode] = useState<'bio' | 'paste'>('paste')
  const [tiktokU, setTiktokU] = useState('')
  const [tiktokTeks, setTiktokTeks] = useState('')
  const [tiktokLoading, setTiktokLoading] = useState(false)
  const [tiktokHasil, setTiktokHasil] = useState<{ nomor: string; nama: string }[]>([])
  const [tiktokPilih, setTiktokPilih] = useState<Set<string>>(new Set())
  const [tiktokImporting, setTiktokImporting] = useState(false)
  const [riwayat, setRiwayat] = useState<WaRiwayat[]>([])
  const [bulanan, setBulanan] = useState(0)

  // Lampiran media
  type MediaMode = 'none' | 'upload' | 'url'
  const [mediaMode, setMediaMode] = useState<MediaMode>('none')
  const [mediaUrl, setMediaUrl] = useState('')        // URL eksternal atau hasil upload
  const [mediaFilename, setMediaFilename] = useState('')
  const [mediaMime, setMediaMime] = useState('')
  const [mediaUploading, setMediaUploading] = useState(false)
  const [mediaUploadedFile, setMediaUploadedFile] = useState('')  // nama file di server
  const [urlSimpan, setUrlSimpan] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pesanRef = useRef<HTMLTextAreaElement>(null)

  const muatRiwayat = useCallback(async () => {
    const r = await fetch('/api/wa-massal/riwayat').then(x => x.json())
    setBulanan(r.bulanan ?? 0)
    setRiwayat(Array.isArray(r.data) ? r.data : [])
  }, [])

  const muatData = useCallback(async () => {
    const [g, t, k, bl] = await Promise.all([
      fetch('/api/wa-massal/grup').then(r => r.json()),
      fetch('/api/wa-massal/template').then(r => r.json()),
      fetch('/api/wa-massal/kontak').then(r => r.json()),
      fetch('/api/wa-massal/blacklist').then(r => r.json()),
    ])
    setGrups(Array.isArray(g) ? g : [])
    setBlacklist(Array.isArray(bl) ? bl : [])
    setTemplates(Array.isArray(t) ? t : [])
    setKontaks(Array.isArray(k) ? k : [])
  }, [])

  useEffect(() => {
    fetch('/api/wa-massal').then(r => r.json()).then(d => setHasEnvToken(!!d.hasEnvToken))
    const saved = localStorage.getItem('zadv_fonnte_token')
    if (saved) { setToken(saved); setTokenSimpan(true) }
    muatData()
    muatRiwayat()
  }, [muatData, muatRiwayat])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])

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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama: namaGrup.trim(), nomor: daftar }),
    })
    setNamaGrup(''); setShowSimpanGrup(false); setSimpanGrupLoading(false)
    muatData()
  }

  async function hapusGrup(id: number) {
    await fetch(`/api/wa-massal/grup/${id}`, { method: 'DELETE' }); muatData()
  }

  async function simpanTemplate() {
    if (!namaTemplate.trim() || !pesan.trim()) return
    setSimpanTemplateLoading(true)
    await fetch('/api/wa-massal/template', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        judul: namaTemplate.trim(),
        teks: pesan,
        mediaUrl: mediaUrl || null,
        mediaFilename: mediaFilename || null,
        mediaMime: mediaMime || null,
      }),
    })
    setNamaTemplate(''); setShowSimpanTemplate(false); setSimpanTemplateLoading(false)
    muatData()
  }

  async function hapusTemplate(id: number) {
    await fetch(`/api/wa-massal/template/${id}`, { method: 'DELETE' }); muatData()
  }

  function muatTemplate(t: WaTemplate) {
    setPesan(t.teks)
    if (t.mediaUrl) {
      const isInternal = t.mediaUrl.includes('/api/wa-massal/media/')
      setMediaMode(isInternal ? 'upload' : 'url')
      setMediaUrl(t.mediaUrl)
      setMediaFilename(t.mediaFilename || '')
      setMediaMime(t.mediaMime || '')
      setMediaUploadedFile('')
      setUrlSimpan(!isInternal) // URL eksternal langsung anggap sudah disimpan
    } else {
      setMediaMode('none')
      setMediaUrl('')
      setMediaFilename('')
      setMediaMime('')
      setMediaUploadedFile('')
      setUrlSimpan(false)
    }
  }

  async function tambahKontak() {
    const nomorArr = formNomors.map(n => normalisiNomor(n)).filter(n => n.length >= 10)
    if (!formNama.trim() || nomorArr.length === 0) return
    setTambahLoading(true)
    try {
      const res = await fetch('/api/wa-massal/kontak', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama: formNama.trim(), nomor: nomorArr, grup: formGrup.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Gagal menyimpan kontak'); setTambahLoading(false); return }
      setFormNama(''); setFormNomors(['']); setFormGrup('')
      await muatData()
    } catch {
      alert('Koneksi error — gagal menyimpan kontak')
    }
    setTambahLoading(false)
  }

  async function hapusKontak(id: number) {
    await fetch(`/api/wa-massal/kontak/${id}`, { method: 'DELETE' }); muatData()
    setChecked(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  async function assignKontakKeGrup() {
    const grup = assignGrupVal === '__baru__' ? assignGrupBaru.trim() : assignGrupVal.trim()
    if (!grup) return
    const ids = [...checked]
    await fetch('/api/wa-massal/kontak/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, grup }),
    })
    await muatData()
    setChecked(new Set())
    setAssignGrupVal('')
    setAssignGrupBaru('')
  }

  async function hapusKontakMassal() {
    if (!confirm(`Hapus ${checked.size} kontak terpilih?`)) return
    const ids = [...checked]
    await fetch('/api/wa-massal/kontak/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    await muatData()
    setChecked(new Set())
  }

  async function tambahKeGrupLabel(kontakId: number, grup: string) {
    const k = kontaks.find(x => x.id === kontakId)
    if (!k) return
    await fetch(`/api/wa-massal/kontak/${kontakId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama: k.nama, nomor: k.nomor, grup }),
    })
    await muatData()
  }

  async function hapusDariGrupLabel(kontakId: number) {
    const k = kontaks.find(x => x.id === kontakId)
    if (!k) return
    await fetch(`/api/wa-massal/kontak/${kontakId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama: k.nama, nomor: k.nomor, grup: null }),
    })
    await muatData()
  }

  async function cariGmaps() {
    if (!gmapsQ.trim()) return
    setGmapsLoading(true)
    setGmapsHasil([])
    setGmapsPilih(new Set())
    try {
      const res = await fetch(`/api/wa-massal/gmaps?q=${encodeURIComponent(gmapsQ)}`)
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Gagal mencari'); return }
      setGmapsHasil(data.places || [])
    } catch { alert('Koneksi error') }
    setGmapsLoading(false)
  }

  async function importGmaps() {
    const dipilih = gmapsHasil.filter(p => gmapsPilih.has(p.id) && p.nomor)
    if (dipilih.length === 0) { alert('Pilih kontak yang memiliki nomor HP terlebih dahulu'); return }
    setGmapsImporting(true)
    let berhasil = 0
    for (const p of dipilih) {
      try {
        const res = await fetch('/api/wa-massal/kontak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nama: p.nama, nomor: [p.nomor], grup: gmapsGrup.trim() || null }),
        })
        if (res.ok) berhasil++
      } catch { /* skip */ }
    }
    await muatData()
    setGmapsImporting(false)
    setGmapsPilih(new Set())
    const diskip = dipilih.length - berhasil
    alert(`${berhasil} kontak berhasil diimport${diskip > 0 ? `, ${diskip} dilewati (nomor sudah ada)` : ''}`)
  }

  async function cariTiktok() {
    setTiktokLoading(true)
    setTiktokHasil([])
    setTiktokPilih(new Set())
    try {
      if (tiktokMode === 'bio') {
        if (!tiktokU.trim()) return
        const res = await fetch(`/api/wa-massal/tiktok?u=${encodeURIComponent(tiktokU.trim())}`)
        const data = await res.json()
        if (!res.ok) { alert(data.error || 'Gagal'); return }
        const list = (data.nomors as string[]).map((n: string) => ({ nomor: n, nama: data.nama || tiktokU }))
        setTiktokHasil(list)
        if (list.length === 0) alert('Tidak ada nomor HP ditemukan di bio akun ini')
      } else {
        if (!tiktokTeks.trim()) return
        const res = await fetch('/api/wa-massal/tiktok', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teks: tiktokTeks }),
        })
        const data = await res.json()
        if (!res.ok) { alert(data.error || 'Gagal'); return }
        const list = (data.nomors as string[]).map((n: string) => ({ nomor: n, nama: '' }))
        setTiktokHasil(list)
        if (list.length === 0) alert('Tidak ada nomor HP ditemukan dalam teks yang di-paste')
      }
    } catch { alert('Koneksi error') }
    setTiktokLoading(false)
  }

  async function importTiktok() {
    const dipilih = tiktokHasil.filter(p => tiktokPilih.has(p.nomor))
    if (dipilih.length === 0) return
    setTiktokImporting(true)
    let berhasil = 0
    for (const p of dipilih) {
      try {
        const res = await fetch('/api/wa-massal/kontak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nama: p.nama || p.nomor, nomor: [p.nomor], grup: tiktokGrup.trim() || null }),
        })
        if (res.ok) berhasil++
      } catch { /* skip */ }
    }
    await muatData()
    setTiktokImporting(false)
    setTiktokPilih(new Set())
    setTiktokHasil([])
    setTiktokTeks('')
    const diskip = dipilih.length - berhasil
    alert(`${berhasil} kontak berhasil diimport${diskip > 0 ? `, ${diskip} dilewati (nomor sudah ada)` : ''}`)
  }

  function mulaiEdit(k: WaKontak) {
    setEditId(k.id)
    setEditNama(k.nama)
    setEditNomors(k.nomor.map(n => '0' + n.replace(/^62/, '')))
    setEditGrup(k.grup ?? '')
    setShowTambahKontak(false)
  }

  async function simpanEdit() {
    if (!editId) return
    const nomorArr = editNomors.map(n => normalisiNomor(n)).filter(n => n.length >= 10)
    if (!editNama.trim() || nomorArr.length === 0) return
    setEditLoading(true)
    try {
      const res = await fetch(`/api/wa-massal/kontak/${editId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama: editNama.trim(), nomor: nomorArr, grup: editGrup.trim() || null }),
      })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Gagal menyimpan'); setEditLoading(false); return }
    } catch { alert('Koneksi error'); setEditLoading(false); return }
    setEditId(null); setEditLoading(false); muatData()
  }

  function toggleCheck(id: number) {
    setChecked(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function tambahKeTujuan() {
    const selected = kontakFiltered.filter(k => checked.has(k.id))
    if (selected.length === 0) return
    const existing = nomorRaw.trim()
    const baru = selected.flatMap(k => k.nomor.map(n => '0' + n.replace(/^62/, ''))).join('\n')
    setNomorRaw(existing ? existing + '\n' + baru : baru)
    // Simpan ke kontakMap untuk substitusi variabel saat kirim
    setKontakMap(prev => {
      const next = new Map(prev)
      selected.forEach(k => k.nomor.forEach(n => next.set(n, { nama: k.nama, grup: k.grup })))
      return next
    })
    setChecked(new Set())
  }

  function tambahGrupKeTujuan(grup: string) {
    const selected = kontaks.filter(k => k.grup === grup)
    if (selected.length === 0) return
    const existing = nomorRaw.trim()
    const baru = selected.flatMap(k => k.nomor.map(n => '0' + n.replace(/^62/, ''))).join('\n')
    setNomorRaw(existing ? existing + '\n' + baru : baru)
    setKontakMap(prev => {
      const next = new Map(prev)
      selected.forEach(k => k.nomor.forEach(n => next.set(n, { nama: k.nama, grup: k.grup })))
      return next
    })
  }

  function substituteVars(template: string, nomor: string): string {
    const info = kontakMap.get(nomor)
    return template
      .replace(/\{\{nama\}\}/g, info?.nama ?? '')
      .replace(/\{\{grup\}\}/g, info?.grup ?? '')
      .replace(/\{\{nomor\}\}/g, '0' + nomor.replace(/^62/, ''))
  }

  function sisipVariabel(varName: string) {
    const el = pesanRef.current
    if (!el) { setPesan(p => p + `{{${varName}}}`); return }
    const start = el.selectionStart ?? pesan.length
    const end = el.selectionEnd ?? pesan.length
    const val = `{{${varName}}}`
    const next = pesan.slice(0, start) + val + pesan.slice(end)
    setPesan(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + val.length, start + val.length)
    })
  }

  async function uploadMedia(file: File) {
    setMediaUploading(true)
    setMediaFilename(file.name)
    setMediaMime(file.type)
    try {
      const res = await fetch('/api/wa-massal/media', {
        method: 'POST',
        headers: { 'x-media-type': file.type, 'x-file-name': file.name },
        body: file,
      })
      const data = await res.json()
      if (res.ok) {
        setMediaUrl(data.url)
        setMediaUploadedFile(data.filename) // uuid filename untuk cleanup
      } else {
        alert(data.error || 'Upload gagal')
        resetMedia()
      }
    } catch (e) {
      alert('Upload gagal: ' + (e instanceof Error ? e.message : 'periksa koneksi'))
      resetMedia()
    }
    setMediaUploading(false)
  }

  function resetMedia() {
    setMediaUrl('')
    setMediaFilename('')
    setMediaMime('')
    setMediaUploadedFile('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (mediaUploadedFile) {
      fetch('/api/wa-massal/media', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: mediaUploadedFile }),
      }).catch(() => {})
    }
    setUrlSimpan(false)
  }

  function simpanUrl() {
    if (!mediaUrl.trim()) return
    const ext = mediaUrl.split('?')[0].split('.').pop()?.toLowerCase() || ''
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', mp4: 'video/mp4',
    }
    const guessedMime = mimeMap[ext] || 'image/jpeg'
    if (!mediaMime) setMediaMime(guessedMime)
    if (!mediaFilename) setMediaFilename(mediaUrl.split('/').pop()?.split('?')[0] || 'file')
    setUrlSimpan(true)
  }

  async function kirim() {
    const daftar = parseNomor(nomorRaw)
    if (!token.trim() && !hasEnvToken) return alert('Masukkan Fonnte API token terlebih dahulu.')
    if (daftar.length === 0) return alert('Nomor tujuan tidak valid.')
    if (!pesan.trim()) return alert('Pesan tidak boleh kosong.')
    simpanToken()
    batalRef.current = false
    setBerjalan(true); setSelesai(false)
    setLog(daftar.map(n => ({ nomor: n, status: 'mengirim' })))

    const lampiranUrl = mediaMode !== 'none' ? mediaUrl.trim() : ''
    const lampiranFilename = mediaFilename || undefined

    for (let i = 0; i < daftar.length; i++) {
      if (batalRef.current) break
      const nomor = daftar[i]
      try {
        const pesanFinal = substituteVars(pesan, nomor)
        const res = await fetch('/api/wa-massal', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: token.trim(), target: nomor, message: pesanFinal,
            cooldownHari: pakaiCooldown ? cooldownHari : 0,
            ...(lampiranUrl ? { url: lampiranUrl, filename: lampiranFilename } : {}),
          }),
        })
        const data = await res.json()
        if (data.skip) {
          updateLog(nomor, { status: 'dilewati', pesan: data.reason })
        } else {
          updateLog(nomor, { status: data.ok ? 'terkirim' : 'gagal', pesan: data.ok ? undefined : data.reason })
          if (i < daftar.length - 1 && !batalRef.current) await new Promise(r => setTimeout(r, delay * 1000))
        }
      } catch {
        updateLog(nomor, { status: 'gagal', pesan: 'Koneksi error' })
      }
    }
    setBerjalan(false); setSelesai(true)
    muatRiwayat()
  }

  function batal() { batalRef.current = true; setBerjalan(false) }

  const daftar = parseNomor(nomorRaw)
  const terkirim = log.filter(l => l.status === 'terkirim').length
  const gagal = log.filter(l => l.status === 'gagal').length
  const dilewati = log.filter(l => l.status === 'dilewati').length
  const mengirim = log.filter(l => l.status === 'mengirim').length
  const blSet = new Set(blacklist.map(b => b.nomor))

  const adaVariabel = /\{\{(nama|grup|nomor)\}\}/.test(pesan)
  const contohNomor = daftar[0] ?? ''
  const contohPesan = contohNomor ? substituteVars(pesan, contohNomor) : pesan

  const grupLabels = Array.from(new Set(kontaks.map(k => k.grup).filter(Boolean))) as string[]
  const cariDigit = cariKontak.replace(/\D/g, '')
  const kontakFiltered = kontaks
    .filter(k => !filterGrup || k.grup === filterGrup)
    .filter(k => !cariKontak.trim() || k.nama.toLowerCase().includes(cariKontak.trim().toLowerCase()) || (cariDigit.length > 0 && k.nomor.some(n => n.includes(cariDigit))))

  const IconX = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  )
  const IconCheck = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-emerald-400">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
    </svg>
  )
  const IconPencil = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    </svg>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">

      {/* Kolom kiri — form */}
      <div className="flex flex-col gap-5">

        {/* Token */}
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378]">FONNTE API TOKEN</p>
            {!hasEnvToken && (
              <a href="https://fonnte.com" target="_blank" rel="noopener noreferrer" className="text-[10.5px] text-[#D8A23D] hover:underline">
                Daftar Fonnte →
              </a>
            )}
          </div>
          {hasEnvToken ? (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <IconCheck />
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
                <button onClick={() => setShowToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#8A8378] hover:text-white">
                  {showToken ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              <label className="flex items-center gap-2 mt-2.5 cursor-pointer w-fit">
                <input type="checkbox" checked={tokenSimpan} onChange={e => setTokenSimpan(e.target.checked)} className="accent-[#D8A23D]" />
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
              {daftar.length > 0 && <span className="text-[10.5px] text-[#D8A23D] font-medium">{daftar.length} nomor</span>}
              {grups.length > 0 && (
                <select
                  onChange={e => {
                    const g = grups.find(x => x.id === parseInt(e.target.value))
                    if (g) setNomorRaw(g.nomor.map(n => '0' + n.replace(/^62/, '')).join('\n'))
                    e.target.value = ''
                  }}
                  defaultValue=""
                  className="text-[11px] bg-[#161311] border border-white/15 rounded px-2 py-1 text-[#B3ACA1] outline-none cursor-pointer hover:border-white/30"
                >
                  <option value="" disabled>Muat grup...</option>
                  {grups.map(g => <option key={g.id} value={g.id}>{g.nama} ({g.nomor.length})</option>)}
                </select>
              )}
            </div>
          </div>
          <textarea
            value={nomorRaw}
            onChange={e => setNomorRaw(e.target.value)}
            rows={6}
            placeholder={'08123456789\n08987654321\n\nSatu nomor per baris, atau pilih dari Kontak di panel kanan.'}
            className="w-full bg-[#161311] border border-white/15 rounded-md px-3 py-2.5 text-[13px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50 resize-none font-mono"
          />
          {daftar.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {daftar.slice(0, 8).map(n => (
                <span key={n} className="text-[10px] font-mono bg-white/[0.05] border border-white/10 px-2 py-0.5 rounded text-[#B3ACA1]">+{n}</span>
              ))}
              {daftar.length > 8 && <span className="text-[10px] text-[#8A8378] px-2 py-0.5">+{daftar.length - 8} lainnya</span>}
            </div>
          )}
          {daftar.length > 0 && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              {!showSimpanGrup ? (
                <button onClick={() => setShowSimpanGrup(true)} className="text-[11.5px] text-[#8A8378] hover:text-[#D8A23D] transition-colors">
                  + Simpan sebagai grup kontak
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    autoFocus type="text" value={namaGrup} onChange={e => setNamaGrup(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && simpanGrup()}
                    placeholder="Nama grup..."
                    className="flex-1 bg-[#161311] border border-white/15 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50"
                  />
                  <button onClick={simpanGrup} disabled={simpanGrupLoading || !namaGrup.trim()} className="px-3 py-1.5 rounded bg-[#D8A23D] text-[#1C1917] text-[12px] font-medium hover:bg-[#C89230] disabled:opacity-50 transition-colors">Simpan</button>
                  <button onClick={() => { setShowSimpanGrup(false); setNamaGrup('') }} className="px-2 py-1.5 rounded border border-white/15 text-[12px] text-[#8A8378] hover:text-white transition-colors">Batal</button>
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
              <span className={`text-[10.5px] ${pesan.length > 4000 ? 'text-red-400' : 'text-[#8A8378]'}`}>{pesan.length} karakter</span>
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
                  {templates.map(t => <option key={t.id} value={t.id}>{t.judul}</option>)}
                </select>
              )}
            </div>
          </div>
          {/* Badge variabel */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className="text-[10px] text-[#4A453D]">Sisip:</span>
            {['nama', 'grup', 'nomor'].map(v => (
              <button key={v} onClick={() => sisipVariabel(v)}
                className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-[#D8A23D]/10 border border-[#D8A23D]/25 text-[#D8A23D] hover:bg-[#D8A23D]/20 transition-colors">
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <textarea
            ref={pesanRef}
            value={pesan} onChange={e => setPesan(e.target.value)} rows={8}
            placeholder={"Halo, selamat pagi, Bapak/Ibu {{nama}}!\n\nKami ingin menginformasikan promo terbaru..."}
            className="w-full bg-[#161311] border border-white/15 rounded-md px-3 py-2.5 text-[13px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50 resize-none leading-relaxed"
          />
          {/* Pratinjau substitusi */}
          {adaVariabel && contohNomor && contohPesan !== pesan && (
            <div className="mt-2 rounded-md bg-white/[0.03] border border-[#D8A23D]/15 p-3">
              <p className="text-[9.5px] font-semibold tracking-[0.12em] text-[#D8A23D]/60 mb-1.5">PRATINJAU — {kontakMap.get(contohNomor)?.nama ?? `+${contohNomor}`}</p>
              <p className="text-[11.5px] text-[#B3ACA1] whitespace-pre-wrap leading-relaxed">{contohPesan}</p>
            </div>
          )}
          {adaVariabel && kontakMap.size === 0 && (
            <p className="text-[10.5px] text-amber-400/70 mt-2">⚠ Tambahkan kontak via panel kanan agar nama dapat disubstitusi.</p>
          )}
          {pesan.trim() && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              {!showSimpanTemplate ? (
                <button onClick={() => setShowSimpanTemplate(true)} className="text-[11.5px] text-[#8A8378] hover:text-[#D8A23D] transition-colors">
                  + Simpan sebagai template pesan
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    autoFocus type="text" value={namaTemplate} onChange={e => setNamaTemplate(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && simpanTemplate()}
                    placeholder="Judul template..."
                    className="flex-1 bg-[#161311] border border-white/15 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50"
                  />
                  <button onClick={simpanTemplate} disabled={simpanTemplateLoading || !namaTemplate.trim()} className="px-3 py-1.5 rounded bg-[#D8A23D] text-[#1C1917] text-[12px] font-medium hover:bg-[#C89230] disabled:opacity-50 transition-colors">Simpan</button>
                  <button onClick={() => { setShowSimpanTemplate(false); setNamaTemplate('') }} className="px-2 py-1.5 rounded border border-white/15 text-[12px] text-[#8A8378] hover:text-white transition-colors">Batal</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lampiran */}
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378]">LAMPIRAN (OPSIONAL)</p>
            {mediaMode !== 'none' && (
              <button onClick={() => { setMediaMode('none'); resetMedia() }}
                className="text-[10.5px] text-[#8A8378] hover:text-red-400 transition-colors">
                Hapus lampiran
              </button>
            )}
          </div>

          {mediaMode === 'none' && (
            <div className="flex gap-2">
              <button onClick={() => setMediaMode('upload')}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border border-white/15 text-[12px] text-[#B3ACA1] hover:border-[#D8A23D]/50 hover:text-white transition-colors">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
                  <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
                </svg>
                Upload File
              </button>
              <button onClick={() => setMediaMode('url')}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border border-white/15 text-[12px] text-[#B3ACA1] hover:border-[#D8A23D]/50 hover:text-white transition-colors">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
                  <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                </svg>
                URL Eksternal
              </button>
            </div>
          )}

          {mediaMode === 'upload' && (
            <div className="flex flex-col gap-3">
              <input ref={fileInputRef} type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,video/mp4"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadMedia(f) }}
                className="hidden" />
              {!mediaUrl && !mediaUploading && (
                <button onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed border-white/15 hover:border-[#D8A23D]/40 transition-colors cursor-pointer text-[#8A8378] hover:text-white">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 opacity-40">
                    <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
                  </svg>
                  <span className="text-[12px]">Klik untuk pilih file</span>
                  <span className="text-[10.5px] text-[#4A453D]">JPG · PNG · GIF · PDF · MP4 · maks 16MB</span>
                </button>
              )}
              {mediaUploading && (
                <div className="flex items-center gap-3 py-4 px-3 rounded-lg bg-white/[0.03]">
                  <span className="w-4 h-4 rounded-full border-2 border-[#D8A23D] border-t-transparent animate-spin shrink-0" />
                  <span className="text-[12px] text-[#8A8378]">Mengunggah {mediaFilename}...</span>
                </div>
              )}
              {mediaUrl && !mediaUploading && (
                <MediaPreview mime={mediaMime} filename={mediaFilename} url={mediaUrl} />
              )}
            </div>
          )}

          {mediaMode === 'url' && (
            <div className="flex flex-col gap-2">
              {urlSimpan ? (
                <>
                  <MediaPreview mime={mediaMime} filename={mediaFilename} url={mediaUrl} />
                  <button onClick={() => setUrlSimpan(false)}
                    className="text-[11px] text-[#8A8378] hover:text-[#D8A23D] transition-colors text-left">
                    Ubah URL
                  </button>
                </>
              ) : (
                <>
                  <input autoFocus type="url" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && simpanUrl()}
                    placeholder="https://contoh.com/gambar.jpg"
                    className="w-full bg-[#161311] border border-white/15 rounded-md px-3 py-2.5 text-[13px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50" />
                  <input type="text" value={mediaFilename} onChange={e => setMediaFilename(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && simpanUrl()}
                    placeholder="Nama file (opsional, untuk PDF)"
                    className="w-full bg-[#161311] border border-white/15 rounded-md px-3 py-2.5 text-[13px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50" />
                  <button onClick={simpanUrl} disabled={!mediaUrl.trim()}
                    className="w-full py-2 rounded-md bg-[#D8A23D] text-[#1C1917] text-[12px] font-medium hover:bg-[#C89230] disabled:opacity-40 transition-colors">
                    Simpan URL
                  </button>
                  <p className="text-[10.5px] text-[#4A453D]">URL harus dapat diakses publik. Fonnte akan mengambil dan mengirimkan file-nya.</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Delay & kirim */}
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-5">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-3">JEDA ANTAR PESAN</p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {DELAY_OPTS.map(d => (
              <button key={d.val} onClick={() => setDelay(d.val)}
                className={`px-3 py-1.5 rounded-md text-[12px] border transition-colors ${delay === d.val ? 'bg-[#D8A23D] text-[#1C1917] border-[#D8A23D] font-medium' : 'border-white/15 text-[#B3ACA1] hover:border-white/30'}`}>
                {d.label}
              </button>
            ))}
          </div>
          {/* Ide 2: Cooldown filter */}
          <div className="flex flex-col gap-2 mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={pakaiCooldown} onChange={e => setPakaiCooldown(e.target.checked)}
                className="accent-[#D8A23D] w-3.5 h-3.5 cursor-pointer" />
              <span className="text-[12px] text-[#B3ACA1]">Lewati nomor yang dikirimi dalam</span>
              <select value={cooldownHari} onChange={e => setCooldownHari(Number(e.target.value))}
                disabled={!pakaiCooldown}
                className="bg-[#161311] border border-white/15 rounded px-2 py-0.5 text-[11.5px] text-[#E7E2DC] outline-none disabled:opacity-40 cursor-pointer">
                {[3, 7, 14, 30, 60, 90].map(h => <option key={h} value={h}>{h} hari</option>)}
              </select>
              <span className="text-[12px] text-[#B3ACA1]">terakhir</span>
            </label>
            {blacklist.length > 0 && (
              <p className="text-[11px] text-[#8A8378] pl-5">· {blacklist.length} nomor di blacklist akan selalu dilewati</p>
            )}
          </div>

          {!berjalan ? (
            <button onClick={kirim} disabled={(!token && !hasEnvToken) || daftar.length === 0 || !pesan.trim()}
              className="w-full py-3 rounded-md bg-[#25D366] text-white text-[13px] font-bold hover:bg-[#20BD5A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Kirim ke {daftar.length} Nomor
            </button>
          ) : (
            <button onClick={batal} className="w-full py-3 rounded-md bg-red-600 text-white text-[13px] font-bold hover:bg-red-500 transition-colors">
              Batalkan Pengiriman
            </button>
          )}
        </div>
      </div>

      {/* Kolom kanan */}
      <div className="flex flex-col gap-4">

        {/* Estimasi */}
        {daftar.length > 0 && !berjalan && !selesai && (
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378] mb-2">ESTIMASI</p>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[12px]"><span className="text-[#8A8378]">Jumlah nomor</span><span className="font-medium">{daftar.length}</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-[#8A8378]">Jeda</span><span className="font-medium">{formatDelay(delay)}/pesan</span></div>
              <div className="flex justify-between text-[12px] border-t border-white/10 pt-1.5 mt-0.5">
                <span className="text-[#8A8378]">Total waktu</span>
                <span className="font-medium text-[#D8A23D]">{formatDurasi(daftar.length * delay)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Progress */}
        {(berjalan || selesai) && log.length > 0 && (
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378]">PROGRESS</p>
              {berjalan && <span className="flex items-center gap-1.5 text-[10.5px] text-[#D8A23D]"><span className="w-1.5 h-1.5 rounded-full bg-[#D8A23D] animate-pulse" />Mengirim...</span>}
              {selesai && <span className="text-[10.5px] text-emerald-400 font-medium">Selesai</span>}
            </div>
            <div className="h-1.5 bg-white/10 rounded-full mb-3 overflow-hidden">
              <div className="h-full rounded-full bg-[#25D366] transition-all duration-500" style={{ width: `${log.length > 0 ? ((terkirim + gagal) / log.length) * 100 : 0}%` }} />
            </div>
            <div className="flex gap-3 mb-3 text-[11.5px] flex-wrap">
              <span className="text-emerald-400">{terkirim} terkirim</span>
              {gagal > 0 && <span className="text-red-400">{gagal} gagal</span>}
              {dilewati > 0 && <span className="text-orange-400">{dilewati} dilewati</span>}
              {mengirim > 0 && <span className="text-[#8A8378]">{mengirim} menunggu</span>}
            </div>
            <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
              {log.map((l, i) => (
                <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/[0.05] last:border-0">
                  <div className="shrink-0 mt-0.5">
                    {l.status === 'mengirim' && <span className="w-3.5 h-3.5 rounded-full border-2 border-[#D8A23D] border-t-transparent animate-spin inline-block" />}
                    {l.status === 'terkirim' && <IconCheck />}
                    {l.status === 'gagal' && <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-red-400"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>}
                    {l.status === 'dilewati' && <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-orange-400"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[11.5px] font-mono ${l.status === 'dilewati' ? 'text-[#8A8378]' : 'text-[#B3ACA1]'}`}>+{l.nomor}</div>
                    {l.pesan && <div className={`text-[10.5px] mt-0.5 truncate ${l.status === 'dilewati' ? 'text-orange-400/70' : 'text-red-400'}`}>{l.pesan}</div>}
                  </div>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Counter bulanan */}
        <div className="rounded-lg bg-white/[0.03] border border-white/10 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[#8A8378]">TERKIRIM BULAN INI</p>
            <p className="text-[28px] font-bold text-[#D8A23D] leading-tight mt-0.5">{bulanan.toLocaleString('id-ID')}</p>
          </div>
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-[#D8A23D]/20">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </div>

        {/* Panel tabs: Kontak / Grup / Template / Riwayat */}
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.07] overflow-hidden">
          {/* Tab header */}
          <div className="flex border-b border-white/[0.07]">
            {([
              ['kontak', `Kontak (${kontaks.length})`],
              ['grup', `Grup (${grupLabels.length + grups.length})`],
              ['template', `Template (${templates.length})`],
              ['riwayat', 'Riwayat'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setActivePanel(key)}
                className={`flex-1 py-2.5 text-[10.5px] font-medium transition-colors ${activePanel === key ? 'text-[#D8A23D] bg-white/[0.04] border-b-2 border-[#D8A23D] -mb-px' : 'text-[#8A8378] hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">

            {/* Panel Kontak */}
            {activePanel === 'kontak' && (
              <div className="flex flex-col gap-3">
                {/* Filter + cari + tambah ke tujuan */}
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4A453D] pointer-events-none">
                      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                    </svg>
                    <input type="text" value={cariKontak} onChange={e => setCariKontak(e.target.value)}
                      placeholder="Cari nama atau nomor..."
                      className="w-full bg-[#161311] border border-white/15 rounded pl-8 pr-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50" />
                    {cariKontak && (
                      <button onClick={() => setCariKontak('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#4A453D] hover:text-white transition-colors">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={filterGrup} onChange={e => setFilterGrup(e.target.value)}
                      className="flex-1 text-[11px] bg-[#161311] border border-white/15 rounded px-2 py-1.5 text-[#B3ACA1] outline-none cursor-pointer hover:border-white/30">
                      <option value="">Semua grup</option>
                      {grupLabels.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    {checked.size > 0 && (
                      <button onClick={tambahKeTujuan}
                        className="px-3 py-1.5 rounded bg-[#25D366] text-white text-[11px] font-medium hover:bg-[#20BD5A] transition-colors whitespace-nowrap">
                        + {checked.size} ke Tujuan
                      </button>
                    )}
                  </div>
                </div>

                {/* Ide 1: Toolbar aksi massal */}
                {checked.size > 0 && (
                  <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg bg-[#D8A23D]/8 border border-[#D8A23D]/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#D8A23D]">{checked.size} kontak dipilih</span>
                      <button onClick={() => setChecked(new Set())} className="text-[10px] text-[#8A8378] hover:text-white transition-colors">Batal pilih</button>
                    </div>
                    <div className="flex gap-1.5">
                      <select value={assignGrupVal} onChange={e => setAssignGrupVal(e.target.value)}
                        className="flex-1 text-[11px] bg-[#161311] border border-white/15 rounded px-2 py-1.5 text-[#B3ACA1] outline-none cursor-pointer hover:border-[#D8A23D]/40">
                        <option value="">Pilih grup...</option>
                        {grupLabels.map(g => <option key={g} value={g}>{g}</option>)}
                        <option value="__baru__">+ Grup baru...</option>
                      </select>
                      <button onClick={assignKontakKeGrup} disabled={!assignGrupVal || (assignGrupVal === '__baru__' && !assignGrupBaru.trim())}
                        className="px-2.5 py-1.5 rounded bg-[#D8A23D] text-[#1C1917] text-[11px] font-medium hover:bg-[#C89230] disabled:opacity-40 transition-colors whitespace-nowrap">
                        Pindahkan
                      </button>
                      <button onClick={hapusKontakMassal}
                        className="px-2.5 py-1.5 rounded bg-red-500/20 text-red-400 text-[11px] font-medium hover:bg-red-500/30 transition-colors">
                        Hapus
                      </button>
                    </div>
                    {assignGrupVal === '__baru__' && (
                      <input type="text" value={assignGrupBaru} onChange={e => setAssignGrupBaru(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && assignKontakKeGrup()}
                        autoFocus placeholder="Nama grup baru..."
                        className="w-full bg-[#161311] border border-[#D8A23D]/40 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none" />
                    )}
                  </div>
                )}

                {/* List kontak */}
                <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                  {kontakFiltered.length === 0 && (
                    <p className="text-[11.5px] text-[#4A453D] text-center py-4">Belum ada kontak</p>
                  )}
                  {kontakFiltered.map(k => (
                    <div key={k.id} className="flex flex-col py-1.5 border-b border-white/[0.05] last:border-0">
                      {editId === k.id ? (
                        /* Inline edit form */
                        <div className="flex flex-col gap-2">
                          <input autoFocus type="text" value={editNama} onChange={e => setEditNama(e.target.value)}
                            placeholder="Nama kontak"
                            className="w-full bg-[#161311] border border-[#D8A23D]/50 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none" />
                          <div className="flex flex-col gap-1.5">
                            {editNomors.map((n, i) => (
                              <div key={i} className="flex gap-1.5">
                                <input type="tel" value={n}
                                  onChange={e => setEditNomors(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                                  placeholder={i === 0 ? 'Nomor WA (08xx / 628xx)' : `Nomor ${i + 1}`}
                                  className="flex-1 bg-[#161311] border border-white/15 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50 font-mono" />
                                {editNomors.length > 1 && (
                                  <button onClick={() => setEditNomors(prev => prev.filter((_, j) => j !== i))}
                                    className="px-2 rounded border border-white/15 text-[#8A8378] hover:text-red-400 hover:border-red-400/30 transition-colors">
                                    <IconX />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button onClick={() => setEditNomors(prev => [...prev, ''])}
                              className="text-[11px] text-[#8A8378] hover:text-[#D8A23D] transition-colors text-left">
                              + Nomor lain
                            </button>
                          </div>
                          <input type="text" value={editGrup} onChange={e => setEditGrup(e.target.value)}
                            placeholder="Grup (opsional)" list="grup-list"
                            className="w-full bg-[#161311] border border-white/15 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50" />
                          <div className="flex gap-2">
                            <button onClick={simpanEdit} disabled={editLoading || !editNama.trim() || editNomors.every(n => !n.trim())}
                              className="flex-1 py-1.5 rounded bg-[#D8A23D] text-[#1C1917] text-[12px] font-medium hover:bg-[#C89230] disabled:opacity-50 transition-colors">
                              {editLoading ? 'Menyimpan...' : 'Simpan'}
                            </button>
                            <button onClick={() => setEditId(null)}
                              className="px-3 py-1.5 rounded border border-white/15 text-[12px] text-[#8A8378] hover:text-white transition-colors">
                              Batal
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Tampilan normal */
                        <div className="flex items-start gap-2 group">
                          <input type="checkbox" checked={checked.has(k.id)} onChange={() => toggleCheck(k.id)}
                            className="accent-[#D8A23D] shrink-0 cursor-pointer mt-1" />
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleCheck(k.id)}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] text-[#E7E2DC] truncate">{k.nama}</span>
                              {k.nomor.length > 1 && (
                                <span className="shrink-0 text-[9px] bg-[#D8A23D]/20 text-[#D8A23D] px-1 py-0.5 rounded font-medium">{k.nomor.length} nomor</span>
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              {k.nomor.map((n, i) => (
                                <span key={i} className="text-[10.5px] font-mono text-[#8A8378]">+{n}</span>
                              ))}
                              {k.grup && <span className="text-[10px] text-[#4A453D] mt-0.5">{k.grup}</span>}
                            </div>
                          </div>
                          <div className="flex gap-0.5 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => mulaiEdit(k)}
                              className="p-1 rounded hover:bg-[#D8A23D]/20 text-[#8A8378] hover:text-[#D8A23D] transition-colors" title="Edit">
                              <IconPencil />
                            </button>
                            <button
                              title={k.nomor.some(n => blSet.has(n)) ? 'Hapus dari blacklist' : 'Blacklist'}
                              onClick={async () => {
                                const nomor = k.nomor[0]
                                if (blSet.has(nomor)) {
                                  await fetch('/api/wa-massal/blacklist', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nomor }) })
                                } else {
                                  await fetch('/api/wa-massal/blacklist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nomor }) })
                                }
                                await muatData()
                              }}
                              className={`p-1 rounded transition-colors ${k.nomor.some(n => blSet.has(n)) ? 'text-orange-400 hover:bg-orange-500/20' : 'text-[#8A8378] hover:bg-orange-500/20 hover:text-orange-400'}`}>
                              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/>
                              </svg>
                            </button>
                            <button onClick={() => hapusKontak(k.id)}
                              className="p-1 rounded hover:bg-red-500/20 text-[#8A8378] hover:text-red-400 transition-colors" title="Hapus">
                              <IconX />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Form tambah kontak */}
                {!showTambahKontak ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    <button onClick={() => { setShowTambahKontak(true); setShowGmaps(false); setShowTiktok(false); setShowBlacklist(false) }}
                      className="text-[11.5px] text-[#8A8378] hover:text-[#D8A23D] transition-colors">
                      + Tambah kontak baru
                    </button>
                    <span className="text-[#4A453D]">·</span>
                    <button onClick={() => { setShowGmaps(v => !v); setShowTambahKontak(false); setShowTiktok(false); setShowBlacklist(false) }}
                      className="text-[11.5px] text-[#8A8378] hover:text-[#D8A23D] transition-colors flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      GMaps
                    </button>
                    <span className="text-[#4A453D]">·</span>
                    <button onClick={() => { setShowTiktok(v => !v); setShowGmaps(false); setShowTambahKontak(false); setShowBlacklist(false) }}
                      className="text-[11.5px] text-[#8A8378] hover:text-[#D8A23D] transition-colors flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.79 1.54V6.78a4.85 4.85 0 0 1-1.02-.09z"/></svg>
                      TikTok
                    </button>
                    {blacklist.length > 0 && <span className="text-[#4A453D]">·</span>}
                    {blacklist.length > 0 && (
                      <button onClick={() => { setShowBlacklist(v => !v); setShowGmaps(false); setShowTiktok(false); setShowTambahKontak(false) }}
                        className="text-[11.5px] text-orange-400/80 hover:text-orange-400 transition-colors flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>
                        Blacklist ({blacklist.length})
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
                    <input autoFocus type="text" value={formNama} onChange={e => setFormNama(e.target.value)}
                      placeholder="Nama kontak"
                      className="w-full bg-[#161311] border border-white/15 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50" />

                    {/* Multi-nomor */}
                    <div className="flex flex-col gap-1.5">
                      {formNomors.map((n, i) => (
                        <div key={i} className="flex gap-1.5">
                          <input type="tel" value={n}
                            onChange={e => setFormNomors(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && i === formNomors.length - 1) {
                                e.preventDefault()
                                setFormNomors(prev => [...prev, ''])
                              }
                            }}
                            placeholder={i === 0 ? 'Nomor WA (08xx / 628xx)' : `Nomor ${i + 1}`}
                            className="flex-1 bg-[#161311] border border-white/15 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50 font-mono" />
                          {formNomors.length > 1 && (
                            <button onClick={() => setFormNomors(prev => prev.filter((_, j) => j !== i))}
                              className="px-2 rounded border border-white/15 text-[#8A8378] hover:text-red-400 hover:border-red-400/30 transition-colors">
                              <IconX />
                            </button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => setFormNomors(prev => [...prev, ''])}
                        className="text-[11px] text-[#8A8378] hover:text-[#D8A23D] transition-colors text-left">
                        + Tambah nomor lain
                      </button>
                    </div>

                    <input type="text" value={formGrup} onChange={e => setFormGrup(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && tambahKontak()}
                      placeholder="Grup (opsional)"
                      list="grup-list"
                      className="w-full bg-[#161311] border border-white/15 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50" />
                    <datalist id="grup-list">
                      {grupLabels.map(g => <option key={g} value={g} />)}
                    </datalist>
                    <div className="flex gap-2">
                      <button onClick={tambahKontak}
                        disabled={tambahLoading || !formNama.trim() || formNomors.every(n => !n.trim())}
                        className="flex-1 py-1.5 rounded bg-[#D8A23D] text-[#1C1917] text-[12px] font-medium hover:bg-[#C89230] disabled:opacity-50 transition-colors">
                        Simpan
                      </button>
                      <button onClick={() => { setShowTambahKontak(false); setFormNama(''); setFormNomors(['']); setFormGrup('') }}
                        className="px-3 py-1.5 rounded border border-white/15 text-[12px] text-[#8A8378] hover:text-white transition-colors">
                        Batal
                      </button>
                    </div>
                  </div>
                )}

                {/* Panel Import GMaps */}
                {showGmaps && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
                    <p className="text-[10px] font-semibold tracking-[0.12em] text-[#4A453D]">IMPORT DARI GOOGLE MAPS</p>
                    <div className="flex gap-1.5">
                      <input
                        type="text" value={gmapsQ} onChange={e => setGmapsQ(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && cariGmaps()}
                        placeholder="Cth: restoran padang jakarta, dokter gigi bandung..."
                        className="flex-1 bg-[#161311] border border-white/15 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50" />
                      <button onClick={cariGmaps} disabled={gmapsLoading || !gmapsQ.trim()}
                        className="px-3 py-1.5 rounded bg-[#D8A23D] text-[#1C1917] text-[12px] font-medium hover:bg-[#C89230] disabled:opacity-50 transition-colors whitespace-nowrap">
                        {gmapsLoading ? '...' : 'Cari'}
                      </button>
                    </div>

                    {gmapsHasil.length > 0 && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#8A8378]">{gmapsHasil.length} hasil ditemukan</span>
                          <button onClick={() => setGmapsPilih(
                            gmapsPilih.size === gmapsHasil.filter(p => p.nomor).length
                              ? new Set()
                              : new Set(gmapsHasil.filter(p => p.nomor).map(p => p.id))
                          )} className="text-[11px] text-[#D8A23D] hover:text-[#C89230] transition-colors">
                            {gmapsPilih.size === gmapsHasil.filter(p => p.nomor).length ? 'Hapus semua' : 'Pilih semua'}
                          </button>
                        </div>
                        <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
                          {gmapsHasil.map(p => (
                            <div key={p.id} onClick={() => p.nomor && setGmapsPilih(prev => {
                              const s = new Set(prev)
                              s.has(p.id) ? s.delete(p.id) : s.add(p.id)
                              return s
                            })} className={`flex items-start gap-2 px-2.5 py-2 rounded border transition-colors ${
                              p.nomor ? 'cursor-pointer hover:border-[#D8A23D]/30' : 'opacity-40 cursor-not-allowed'
                            } ${gmapsPilih.has(p.id) ? 'border-[#D8A23D]/40 bg-[#D8A23D]/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                              <input type="checkbox" readOnly checked={gmapsPilih.has(p.id)}
                                disabled={!p.nomor} className="accent-[#D8A23D] shrink-0 mt-0.5 cursor-pointer" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] text-[#E7E2DC] truncate">{p.nama}</p>
                                {p.nomor
                                  ? <p className="text-[11px] font-mono text-[#25D366]">{p.nomorRaw}</p>
                                  : <p className="text-[10.5px] text-[#4A453D] italic">Tidak ada nomor HP</p>
                                }
                                <p className="text-[10px] text-[#4A453D] truncate mt-0.5">{p.alamat}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        {gmapsPilih.size > 0 && (
                          <div className="flex gap-1.5">
                            <input type="text" value={gmapsGrup} onChange={e => setGmapsGrup(e.target.value)}
                              list="grup-list" placeholder="Masukkan ke grup (opsional)"
                              className="flex-1 bg-[#161311] border border-white/15 rounded px-2.5 py-1.5 text-[11.5px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50" />
                            <button onClick={importGmaps} disabled={gmapsImporting}
                              className="px-3 py-1.5 rounded bg-[#25D366] text-white text-[12px] font-medium hover:bg-[#20BD5A] disabled:opacity-50 transition-colors whitespace-nowrap">
                              {gmapsImporting ? '...' : `Import ${gmapsPilih.size}`}
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {!gmapsLoading && gmapsHasil.length === 0 && gmapsQ && (
                      <p className="text-[11px] text-[#4A453D] text-center py-2">Belum ada hasil — coba kata kunci lain</p>
                    )}
                  </div>
                )}

                {/* Panel Import TikTok */}
                {showTiktok && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
                    <p className="text-[10px] font-semibold tracking-[0.12em] text-[#4A453D]">IMPORT DARI TIKTOK</p>

                    {/* Mode tabs */}
                    <div className="flex gap-1 p-0.5 bg-white/[0.04] rounded-md">
                      {(['paste', 'bio'] as const).map(m => (
                        <button key={m} onClick={() => { setTiktokMode(m); setTiktokHasil([]); setTiktokPilih(new Set()) }}
                          className={`flex-1 py-1 rounded text-[11.5px] font-medium transition-colors ${
                            tiktokMode === m ? 'bg-[#D8A23D] text-[#1C1917]' : 'text-[#8A8378] hover:text-white'
                          }`}>
                          {m === 'paste' ? 'Paste Teks' : 'Dari Bio'}
                        </button>
                      ))}
                    </div>

                    {tiktokMode === 'paste' ? (
                      <>
                        <p className="text-[10.5px] text-[#8A8378]">
                          Copy komentar, bio, atau teks dari TikTok lalu paste di sini. Nomor HP akan diekstrak otomatis.
                        </p>
                        <textarea value={tiktokTeks} onChange={e => setTiktokTeks(e.target.value)}
                          rows={4} placeholder="Paste teks dari TikTok di sini..."
                          className="w-full bg-[#161311] border border-white/15 rounded px-3 py-2 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50 resize-none font-mono" />
                        <button onClick={cariTiktok} disabled={tiktokLoading || !tiktokTeks.trim()}
                          className="w-full py-1.5 rounded bg-[#D8A23D] text-[#1C1917] text-[12px] font-medium hover:bg-[#C89230] disabled:opacity-50 transition-colors">
                          {tiktokLoading ? 'Mencari...' : 'Ekstrak Nomor HP'}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-[10.5px] text-[#8A8378]">
                          Masukkan username TikTok. Nomor HP akan diambil dari kolom bio profil.
                        </p>
                        <div className="flex gap-1.5">
                          <input type="text" value={tiktokU} onChange={e => setTiktokU(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && cariTiktok()}
                            placeholder="@username atau tiktok.com/@username"
                            className="flex-1 bg-[#161311] border border-white/15 rounded px-3 py-1.5 text-[12px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50" />
                          <button onClick={cariTiktok} disabled={tiktokLoading || !tiktokU.trim()}
                            className="px-3 py-1.5 rounded bg-[#D8A23D] text-[#1C1917] text-[12px] font-medium hover:bg-[#C89230] disabled:opacity-50 transition-colors whitespace-nowrap">
                            {tiktokLoading ? '...' : 'Ambil'}
                          </button>
                        </div>
                      </>
                    )}

                    {tiktokHasil.length > 0 && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#8A8378]">{tiktokHasil.length} nomor ditemukan</span>
                          <button onClick={() => setTiktokPilih(
                            tiktokPilih.size === tiktokHasil.length ? new Set() : new Set(tiktokHasil.map(p => p.nomor))
                          )} className="text-[11px] text-[#D8A23D] hover:text-[#C89230] transition-colors">
                            {tiktokPilih.size === tiktokHasil.length ? 'Hapus semua' : 'Pilih semua'}
                          </button>
                        </div>
                        <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
                          {tiktokHasil.map((p, i) => (
                            <div key={i} onClick={() => setTiktokPilih(prev => {
                              const s = new Set(prev); s.has(p.nomor) ? s.delete(p.nomor) : s.add(p.nomor); return s
                            })} className={`flex items-center gap-2 px-2.5 py-2 rounded border cursor-pointer transition-colors ${
                              tiktokPilih.has(p.nomor) ? 'border-[#D8A23D]/40 bg-[#D8A23D]/5' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/20'
                            }`}>
                              <input type="checkbox" readOnly checked={tiktokPilih.has(p.nomor)} className="accent-[#D8A23D] shrink-0 cursor-pointer" />
                              <div className="flex-1 min-w-0">
                                {p.nama && p.nama !== p.nomor && (
                                  <p className="text-[11.5px] text-[#E7E2DC] truncate">{p.nama}</p>
                                )}
                                <p className="text-[12px] font-mono text-[#25D366]">+{p.nomor}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        {tiktokPilih.size > 0 && (
                          <div className="flex gap-1.5">
                            <input type="text" value={tiktokGrup} onChange={e => setTiktokGrup(e.target.value)}
                              list="grup-list" placeholder="Masukkan ke grup (opsional)"
                              className="flex-1 bg-[#161311] border border-white/15 rounded px-2.5 py-1.5 text-[11.5px] text-[#E7E2DC] placeholder-[#4A453D] outline-none focus:border-[#D8A23D]/50" />
                            <button onClick={importTiktok} disabled={tiktokImporting}
                              className="px-3 py-1.5 rounded bg-[#25D366] text-white text-[12px] font-medium hover:bg-[#20BD5A] disabled:opacity-50 transition-colors whitespace-nowrap">
                              {tiktokImporting ? '...' : `Import ${tiktokPilih.size}`}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Panel Blacklist */}
            {activePanel === 'kontak' && showBlacklist && (
              <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold tracking-[0.12em] text-orange-400/70">NOMOR DIBLACKLIST</p>
                  <span className="text-[10px] text-[#4A453D]">Nomor ini tidak akan dikirim WA</span>
                </div>
                {blacklist.length === 0 ? (
                  <p className="text-[11.5px] text-[#4A453D] text-center py-3">Belum ada nomor di blacklist</p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
                    {blacklist.map(b => (
                      <div key={b.nomor} className="flex items-center gap-2 px-2.5 py-2 rounded bg-orange-500/[0.05] border border-orange-500/15">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-mono text-[#B3ACA1]">+{b.nomor}</p>
                          {b.alasan && <p className="text-[10.5px] text-[#8A8378] truncate">{b.alasan}</p>}
                        </div>
                        <button onClick={async () => {
                          await fetch('/api/wa-massal/blacklist', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nomor: b.nomor }) })
                          await muatData()
                        }} className="shrink-0 text-[10.5px] text-[#8A8378] hover:text-red-400 px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors">
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Panel Grup */}
            {activePanel === 'grup' && (
              <div className="flex flex-col gap-3">
                {/* Grup dari kategori Kontak */}
                {grupLabels.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-semibold tracking-[0.12em] text-[#4A453D]">DARI KONTAK</p>
                    {grupLabels.map(g => {
                      const anggota = kontaks.filter(k => k.grup === g)
                      const bukan = kontaks.filter(k => k.grup !== g)
                      const total = anggota.reduce((s, k) => s + k.nomor.length, 0)
                      const sedangKelola = kelolaGrupLabel === g
                      return (
                        <div key={g} className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center justify-between px-3 py-2 rounded bg-white/[0.04] border border-white/[0.06]">
                              <span className="text-[12px] text-[#E7E2DC] truncate">{g}</span>
                              <span className="text-[10.5px] text-[#8A8378] ml-2 shrink-0">{anggota.length} kontak · {total} nomor</span>
                            </div>
                            <button onClick={() => tambahGrupKeTujuan(g)}
                              className="px-2.5 py-2 rounded bg-[#25D366]/20 text-[#25D366] text-[11px] font-medium hover:bg-[#25D366]/30 transition-colors whitespace-nowrap">
                              + Tujuan
                            </button>
                            <button onClick={() => setKelolaGrupLabel(sedangKelola ? null : g)}
                              className={`px-2.5 py-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${sedangKelola ? 'bg-[#D8A23D]/20 text-[#D8A23D]' : 'bg-white/[0.06] text-[#8A8378] hover:text-white'}`}>
                              Kelola
                            </button>
                          </div>

                          {sedangKelola && (
                            <div className="flex flex-col gap-1.5 ml-2 pl-3 border-l-2 border-[#D8A23D]/20">
                              {/* Anggota grup */}
                              {anggota.length > 0 && (
                                <div className="flex flex-col gap-1">
                                  <p className="text-[10px] font-semibold tracking-[0.1em] text-[#4A453D]">ANGGOTA ({anggota.length})</p>
                                  {anggota.map(k => (
                                    <div key={k.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-white/[0.03] border border-white/[0.06]">
                                      <div className="flex-1 min-w-0">
                                        <span className="text-[11.5px] text-[#E7E2DC] truncate">{k.nama}</span>
                                        <span className="text-[10px] text-[#8A8378] ml-1.5 font-mono">·{k.nomor[0]}</span>
                                      </div>
                                      <button onClick={() => hapusDariGrupLabel(k.id)}
                                        className="text-[10px] text-[#8A8378] hover:text-red-400 transition-colors px-1.5 py-0.5 rounded hover:bg-red-500/10">
                                        Keluarkan
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* Kontak belum di grup */}
                              {bukan.length > 0 && (
                                <div className="flex flex-col gap-1">
                                  <p className="text-[10px] font-semibold tracking-[0.1em] text-[#4A453D]">TAMBAH KONTAK</p>
                                  <div className="max-h-32 overflow-y-auto flex flex-col gap-1">
                                    {bukan.map(k => (
                                      <div key={k.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-white/[0.02] border border-white/[0.04]">
                                        <div className="flex-1 min-w-0">
                                          <span className="text-[11.5px] text-[#B3ACA1] truncate">{k.nama}</span>
                                          {k.grup && <span className="text-[9.5px] text-[#4A453D] ml-1.5">({k.grup})</span>}
                                        </div>
                                        <button onClick={() => tambahKeGrupLabel(k.id, g)}
                                          className="text-[10px] text-[#D8A23D] hover:text-[#C89230] transition-colors px-1.5 py-0.5 rounded hover:bg-[#D8A23D]/10">
                                          + Tambah
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Kontak tanpa grup */}
                {(() => {
                  const tanpaGrup = kontaks.filter(k => !k.grup)
                  if (tanpaGrup.length === 0) return null
                  const sedangKelola = kelolaGrupLabel === '__tanpa_grup__'
                  return (
                    <div className="flex flex-col gap-1.5">
                      {grupLabels.length > 0 && <div className="border-t border-white/[0.06]" />}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center justify-between px-3 py-2 rounded bg-white/[0.03] border border-dashed border-white/[0.08]">
                          <span className="text-[12px] text-[#8A8378] italic">Tanpa grup</span>
                          <span className="text-[10.5px] text-[#4A453D] ml-2 shrink-0">{tanpaGrup.length} kontak</span>
                        </div>
                        <button onClick={() => setKelolaGrupLabel(sedangKelola ? null : '__tanpa_grup__')}
                          className={`px-2.5 py-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${sedangKelola ? 'bg-[#D8A23D]/20 text-[#D8A23D]' : 'bg-white/[0.06] text-[#8A8378] hover:text-white'}`}>
                          Kelola
                        </button>
                      </div>
                      {sedangKelola && (
                        <div className="flex flex-col gap-1.5 ml-2 pl-3 border-l-2 border-white/10">
                          <p className="text-[10px] font-semibold tracking-[0.1em] text-[#4A453D]">ASSIGN KE GRUP</p>
                          <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                            {tanpaGrup.map(k => (
                              <div key={k.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-white/[0.03] border border-white/[0.06]">
                                <div className="flex-1 min-w-0">
                                  <span className="text-[11.5px] text-[#E7E2DC] truncate">{k.nama}</span>
                                  <span className="text-[10px] text-[#8A8378] ml-1.5 font-mono">·{k.nomor[0]}</span>
                                </div>
                                <select defaultValue="" onChange={async e => {
                                  const grup = e.target.value
                                  if (!grup) return
                                  await fetch(`/api/wa-massal/kontak/${k.id}`, {
                                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ nama: k.nama, nomor: k.nomor, grup }),
                                  })
                                  await muatData()
                                  e.target.value = ''
                                }} className="text-[10.5px] bg-[#161311] border border-white/15 rounded px-1.5 py-0.5 text-[#B3ACA1] outline-none cursor-pointer hover:border-[#D8A23D]/40 max-w-[110px]">
                                  <option value="" disabled>Pilih grup...</option>
                                  {grupLabels.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Grup Tersimpan (WaGrupKontak) */}
                <div className="flex flex-col gap-1.5">
                  {grupLabels.length > 0 && (
                    <p className="text-[10px] font-semibold tracking-[0.12em] text-[#4A453D]">TERSIMPAN</p>
                  )}
                  {grups.length === 0 && grupLabels.length === 0 && (
                    <p className="text-[11.5px] text-[#4A453D] text-center py-4">Belum ada grup tersimpan</p>
                  )}
                  {grups.length === 0 && grupLabels.length > 0 && (
                    <p className="text-[11px] text-[#4A453D] italic">Belum ada — simpan dari panel Nomor Tujuan</p>
                  )}
                  {grups.map(g => (
                    <div key={g.id} className="flex items-center gap-2 group">
                      <button onClick={() => setNomorRaw(g.nomor.map(n => '0' + n.replace(/^62/, '')).join('\n'))}
                        className="flex-1 text-left flex items-center justify-between px-3 py-2 rounded bg-white/[0.04] hover:bg-white/[0.08] transition-colors border border-white/[0.06]">
                        <span className="text-[12px] text-[#E7E2DC] truncate">{g.nama}</span>
                        <span className="text-[10.5px] text-[#8A8378] ml-2 shrink-0">{g.nomor.length} nomor</span>
                      </button>
                      <button onClick={() => hapusGrup(g.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/20 text-[#8A8378] hover:text-red-400 transition-all">
                        <IconX />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Panel Template */}
            {activePanel === 'template' && (
              <div className="flex flex-col gap-1.5">
                {templates.length === 0 && <p className="text-[11.5px] text-[#4A453D] text-center py-4">Belum ada template tersimpan</p>}
                {templates.map(t => (
                  <div key={t.id} className="flex items-center gap-2 group">
                    <button onClick={() => muatTemplate(t)}
                      className="flex-1 text-left px-3 py-2 rounded bg-white/[0.04] hover:bg-white/[0.08] transition-colors border border-white/[0.06]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] text-[#E7E2DC] truncate">{t.judul}</span>
                        {t.mediaUrl && (
                          <span className="shrink-0 text-[10px] text-[#D8A23D]">
                            {t.mediaMime?.startsWith('image/') ? '🖼' : t.mediaMime === 'application/pdf' ? '📄' : t.mediaMime?.startsWith('video/') ? '🎬' : '📎'}
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-[#8A8378] truncate mt-0.5">{t.teks.slice(0, 50)}{t.teks.length > 50 ? '...' : ''}</div>
                    </button>
                    <button onClick={() => hapusTemplate(t.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/20 text-[#8A8378] hover:text-red-400 transition-all">
                      <IconX />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Panel Riwayat */}
            {activePanel === 'riwayat' && (
              <div className="flex flex-col gap-1">
                {riwayat.length === 0 && <p className="text-[11.5px] text-[#4A453D] text-center py-6">Belum ada riwayat pengiriman</p>}
                <div className="flex flex-col max-h-80 overflow-y-auto">
                  {riwayat.map(r => (
                    <div key={r.id} className="flex items-start gap-2.5 py-2.5 border-b border-white/[0.05] last:border-0">
                      <div className="shrink-0 mt-0.5">
                        {r.status === 'terkirim'
                          ? <IconCheck />
                          : <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-red-400"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11.5px] font-mono text-[#B3ACA1] truncate">+{r.nomor}</span>
                          <span className="text-[10px] text-[#4A453D] shrink-0">{waktuRelatif(r.sentAt)}</span>
                        </div>
                        <div className="text-[10.5px] text-[#8A8378] truncate mt-0.5">
                          {r.mediaUrl && <span className="text-[#D8A23D] mr-1">📎</span>}
                          {r.pesan.slice(0, 60)}{r.pesan.length > 60 ? '...' : ''}
                        </div>
                        {r.alasan && <div className="text-[10px] text-red-400 truncate mt-0.5">{r.alasan}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                {riwayat.length === 100 && (
                  <p className="text-[10px] text-[#4A453D] text-center pt-2">Menampilkan 100 riwayat terbaru</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
