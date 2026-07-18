'use client'
import { useEffect, useState } from 'react'

interface PromoApp { id: number; nama: string; emoji: string; tagline: string }

interface Draft {
  id?: number
  judul: string
  slug: string
  deskripsi: string
  tags: string[]
  konten: string
  date?: string
}

function renderMarkdownBasic(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-[#E7E2DC] mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-[#E7E2DC] mt-7 mb-3 border-b border-white/10 pb-1">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[#E7E2DC]">$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-[#B8B3AC]">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul class="my-3 space-y-1">${m}</ul>`)
    .replace(/^(?!<[h|u|l]).+$/gm, (line) => line.trim() ? `<p class="text-[#B8B3AC] leading-relaxed my-2">${line}</p>` : '')
    .replace(/\n{2,}/g, '')
}

export default function ArtikelPage() {
  const [apps, setApps] = useState<PromoApp[]>([])
  const [selectedApp, setSelectedApp] = useState<PromoApp | null>(null)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [activePanel, setActivePanel] = useState<'edit' | 'preview'>('edit')
  const [result, setResult] = useState<{ url: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/apps').then(r => r.json()).then(d => setApps(d.filter((a: any) => a.aktif)))
  }, [])

  async function generate() {
    if (!selectedApp) return
    setLoading(true)
    setError('')
    setDraft(null)
    setResult(null)
    try {
      const res = await fetch('/api/generate/artikel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: selectedApp.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal generate')
      setDraft(data)
      setActivePanel('edit')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function publish() {
    if (!draft) return
    setPublishing(true)
    setError('')
    try {
      const res = await fetch('/api/artikel/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal publish')
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-120px)]">
      {/* Sidebar: pilih app */}
      <aside className="w-56 shrink-0 flex flex-col gap-2 overflow-y-auto">
        <p className="text-[11px] uppercase tracking-widest text-[#8A8378] mb-1 px-1">Pilih Aplikasi</p>
        {apps.map(app => (
          <button
            key={app.id}
            onClick={() => { setSelectedApp(app); setDraft(null); setResult(null); setError('') }}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
              selectedApp?.id === app.id
                ? 'bg-[#D8A23D]/15 border border-[#D8A23D]/40 text-white'
                : 'border border-transparent hover:bg-white/5 text-[#B8B3AC]'
            }`}
          >
            <span className="text-xl shrink-0">{app.emoji}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium truncate">{app.nama}</p>
              <p className="text-[11px] text-[#6B6560] truncate">{app.tagline}</p>
            </div>
          </button>
        ))}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[15px] font-semibold">
              {selectedApp ? `${selectedApp.emoji} ${selectedApp.nama}` : 'Pilih aplikasi untuk mulai'}
            </h2>
            {selectedApp && (
              <p className="text-[12px] text-[#8A8378] mt-0.5">{selectedApp.tagline}</p>
            )}
          </div>
          <button
            onClick={generate}
            disabled={!selectedApp || loading}
            className="flex items-center gap-2 rounded-lg bg-[#D8A23D] px-4 py-2 text-[13px] font-semibold text-[#1C1917] transition-opacity disabled:opacity-40 hover:opacity-90 active:scale-95"
          >
            {loading ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-[#1C1917] border-t-transparent animate-spin" />
                Generating...
              </>
            ) : (
              <>✦ Generate Artikel</>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        {/* Loading placeholder */}
        {loading && (
          <div className="flex-1 rounded-xl border border-white/10 bg-white/3 flex flex-col items-center justify-center gap-4 text-[#6B6560]">
            <div className="h-8 w-8 rounded-full border-2 border-[#D8A23D] border-t-transparent animate-spin" />
            <p className="text-[13px]">Gemini sedang menulis artikel...</p>
          </div>
        )}

        {/* Draft editor */}
        {draft && !loading && !result && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Meta info */}
            <div className="mb-3 rounded-lg border border-white/8 bg-white/3 px-4 py-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-[11px] text-[#8A8378] w-20 shrink-0 pt-0.5">Judul</span>
                <input
                  value={draft.judul}
                  onChange={e => setDraft({ ...draft, judul: e.target.value })}
                  className="flex-1 bg-transparent text-[13px] text-[#E7E2DC] outline-none border-b border-white/10 pb-0.5 focus:border-[#D8A23D]"
                />
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[11px] text-[#8A8378] w-20 shrink-0 pt-0.5">Slug</span>
                <input
                  value={draft.slug}
                  onChange={e => setDraft({ ...draft, slug: e.target.value })}
                  className="flex-1 bg-transparent text-[13px] text-[#6B6560] font-mono outline-none border-b border-white/10 pb-0.5 focus:border-[#D8A23D]"
                />
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[11px] text-[#8A8378] w-20 shrink-0 pt-0.5">Deskripsi</span>
                <input
                  value={draft.deskripsi}
                  onChange={e => setDraft({ ...draft, deskripsi: e.target.value })}
                  className="flex-1 bg-transparent text-[13px] text-[#B8B3AC] outline-none border-b border-white/10 pb-0.5 focus:border-[#D8A23D]"
                />
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[11px] text-[#8A8378] w-20 shrink-0 pt-0.5">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {draft.tags.map(tag => (
                    <span key={tag} className="rounded-full bg-[#D8A23D]/10 border border-[#D8A23D]/20 px-2 py-0.5 text-[11px] text-[#D8A23D]">{tag}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Panel tabs */}
            <div className="flex items-center gap-1 mb-2">
              {(['edit', 'preview'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setActivePanel(p)}
                  className={`px-3 py-1 rounded text-[12px] capitalize transition-colors ${
                    activePanel === p ? 'bg-white/10 text-white font-medium' : 'text-[#8A8378] hover:text-white'
                  }`}
                >
                  {p === 'edit' ? 'Edit Markdown' : 'Preview'}
                </button>
              ))}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={generate}
                  disabled={loading}
                  className="text-[12px] text-[#8A8378] hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors"
                >
                  ↺ Generate Ulang
                </button>
                <button
                  onClick={publish}
                  disabled={publishing}
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-500 px-4 py-1.5 text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {publishing ? (
                    <>
                      <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Publishing...
                    </>
                  ) : '↑ Publish ke Zomet'}
                </button>
              </div>
            </div>

            {/* Editor / Preview */}
            <div className="flex-1 min-h-0 rounded-xl border border-white/10 overflow-hidden">
              {activePanel === 'edit' ? (
                <textarea
                  value={draft.konten}
                  onChange={e => setDraft({ ...draft, konten: e.target.value })}
                  className="w-full h-full resize-none bg-[#161311] px-5 py-4 text-[13px] font-mono text-[#B8B3AC] leading-relaxed outline-none"
                  spellCheck={false}
                />
              ) : (
                <div
                  className="h-full overflow-y-auto px-6 py-5 text-[14px] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownBasic(draft.konten) }}
                />
              )}
            </div>
          </div>
        )}

        {/* Success state */}
        {result && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center text-3xl">✓</div>
            <div>
              <p className="text-[15px] font-semibold text-white mb-1">Artikel berhasil dipublish!</p>
              <p className="text-[13px] text-[#8A8378]">Railway sedang deploy... artikel aktif dalam ~2 menit.</p>
            </div>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-[#D8A23D] hover:underline font-mono"
            >
              {result.url}
            </a>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => { setDraft(null); setResult(null); setError('') }}
                className="rounded-lg bg-white/8 hover:bg-white/12 px-4 py-2 text-[13px] text-[#B8B3AC] transition-colors"
              >
                Generate Artikel Baru
              </button>
              <button
                onClick={() => { setResult(null); }}
                className="rounded-lg bg-white/8 hover:bg-white/12 px-4 py-2 text-[13px] text-[#B8B3AC] transition-colors"
              >
                Edit Artikel Ini
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !draft && !result && (
          <div className="flex-1 rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center gap-3 text-[#6B6560]">
            <span className="text-4xl">📝</span>
            <p className="text-[13px]">
              {selectedApp ? `Klik "Generate Artikel" untuk membuat artikel tentang ${selectedApp.nama}` : 'Pilih aplikasi dari sidebar'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
