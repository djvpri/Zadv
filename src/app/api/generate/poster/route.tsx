import { ImageResponse } from '@vercel/og'
import prisma from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const appId = searchParams.get('appId')
  const idNum = Number(appId)
  if (!appId || !Number.isInteger(idNum)) return new Response('appId tidak valid', { status: 400 })

  const app = await prisma.promoApp.findUnique({ where: { id: idNum } })
  if (!app) return new Response('App tidak ditemukan', { status: 404 })

  await prisma.kontenPromo.create({ data: { appId: app.id, tipe: 'poster' } })

  const fiturTampil = app.fitur.slice(0, 3)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: app.tint,
          padding: 64,
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -60,
            top: -60,
            width: 340,
            height: 340,
            borderRadius: '50%',
            backgroundColor: app.accent,
            opacity: 0.12,
            display: 'flex',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 90, display: 'flex' }}>{app.emoji}</div>
          <div style={{ fontSize: 56, fontWeight: 800, color: app.accent, marginTop: 16, display: 'flex' }}>
            {app.nama}
          </div>
          <div style={{ fontSize: 26, color: '#4A453D', marginTop: 6, display: 'flex' }}>{app.tagline}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fiturTampil.map((f: string) => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', fontSize: 24, color: '#4A453D' }}>
              <span style={{ color: app.accent, marginRight: 10, display: 'flex' }}>✓</span>
              <span style={{ display: 'flex' }}>{f}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 42, fontWeight: 800, color: app.accent, display: 'flex' }}>Rp 100.000</div>
            <div style={{ fontSize: 22, color: '#4A453D', display: 'flex' }}>/bulan</div>
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#FFFFFF',
              backgroundColor: app.accent,
              padding: '16px 32px',
              borderRadius: 999,
              display: 'flex',
            }}
          >
            Coba Sekarang
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  )
}
