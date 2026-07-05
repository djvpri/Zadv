import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Meja Promosi — Zomet',
  description: 'Pusat cetak konten promosi untuk ekosistem Zomet',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-[#1C1917] text-[#E7E2DC]">{children}</body>
    </html>
  )
}
