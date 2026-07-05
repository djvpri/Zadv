'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.push('/app')
        router.refresh()
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Gagal masuk')
    } catch {
      setError('Tidak ada koneksi ke server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1C1917] px-4">
      <form onSubmit={submit} className="w-full max-w-xs">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-lg bg-[#D8A23D] flex items-center justify-center mx-auto mb-3 text-2xl">
            🖨️
          </div>
          <h1 className="text-white text-base font-bold tracking-wide">MEJA PROMOSI</h1>
          <p className="text-[#8A8378] text-xs mt-1">Zomet Ecosystem</p>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#6B6459] outline-none focus:border-[#D8A23D] transition-colors"
        />
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-3 w-full py-2.5 rounded-lg bg-[#D8A23D] text-[#1C1917] text-sm font-semibold hover:bg-[#E3B458] disabled:opacity-50 transition-colors"
        >
          {loading ? 'Memeriksa...' : 'Masuk'}
        </button>
      </form>
    </div>
  )
}
