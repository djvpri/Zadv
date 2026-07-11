'use client'
import { useState, useEffect } from 'react'

interface Riwayat {
  id: number
  tipe: string
  platform?: string | null
  tone?: string | null
  teks?: string | null
  createdAt: string
  app: { nama: string; emoji: string; accent: string }
}

const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', whatsapp: 'WhatsApp', facebook: 'Facebook' }

export default function RiwayatPage() {
  const [riwayat, setRiwayat] = useState<Riwayat[]>([])
  const [loading, setLoading] = useState(true)
  const [disalinId, setDisalinId] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/riwayat')
      .then((r) => r.json())
      .then(setRiwayat)
      .finally(() => setLoading(false))
  }, [])

  function salin(id: number, teks: string) {
    navigator.clipboard?.writeText(teks).catch(() => {})
    setDisalinId(id)
    setTimeout(() => setDisalinId(null), 1500)
  }

  if (loading) return <p className="text-[#8A8378] text-sm">Memuat...</p>

  if (riwayat.length === 0) {
    return <p className="text-[#8A8378] text-sm">Belum ada konten yang dibuat. Mulai dari Z Adv.</p>
  }

  return (
    <div className="flex flex-col gap-2 max-w-2xl">
      {riwayat.map((r) => (
        <div key={r.id} className="rounded-lg bg-white/[0.03] border border-white/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-[12px]">
              <span>{r.app.emoji}</span>
              <span className="font-medium">{r.app.nama}</span>
              <span className="text-[#8A8378]">
                · {r.tipe === 'poster' ? 'Poster' : PLATFORM_LABEL[r.platform || ''] || r.platform}
              </span>
            </div>
            <span className="text-[10.5px] text-[#6B6459]">
              {new Date(r.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          {r.teks ? (
            <>
              <p className="text-[12.5px] text-[#CFC9BE] whitespace-pre-wrap leading-relaxed">{r.teks}</p>
              <button
                onClick={() => salin(r.id, r.teks!)}
                className="mt-2 text-[11px] text-[#D8A23D] hover:underline"
              >
                {disalinId === r.id ? '✓ Tersalin' : '📋 Salin'}
              </button>
            </>
          ) : (
            <p className="text-[12px] text-[#8A8378] italic">Poster diunduh (tidak disimpan teksnya)</p>
          )}
        </div>
      ))}
    </div>
  )
}
