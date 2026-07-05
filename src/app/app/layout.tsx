'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  { href: '/app', label: 'Meja Cetak' },
  { href: '/app/riwayat', label: 'Riwayat' },
  { href: '/app/kelola', label: 'Kelola App' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[#1C1917] text-[#E7E2DC]">
      <div className="border-b border-white/10 bg-[#161311]">
        <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-[#D8A23D] flex items-center justify-center shrink-0 text-lg">
              🖨️
            </div>
            <div>
              <h1 className="text-[15px] font-bold tracking-wide leading-none">MEJA PROMOSI</h1>
              <p className="text-[11px] text-[#8A8378] mt-0.5 tracking-wide">Zomet Ecosystem</p>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`text-[12.5px] px-3 py-1.5 rounded-md transition-colors ${
                  pathname === n.href
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-[#8A8378] hover:text-white hover:bg-white/5'
                }`}
              >
                {n.label}
              </Link>
            ))}
            <button
              onClick={logout}
              className="text-[12.5px] px-3 py-1.5 rounded-md text-[#8A8378] hover:text-white hover:bg-white/5 transition-colors ml-2"
            >
              Keluar
            </button>
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-5 py-6">{children}</div>
    </div>
  )
}
