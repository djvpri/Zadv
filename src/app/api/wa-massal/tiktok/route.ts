import { NextRequest, NextResponse } from 'next/server'

function normalizeNomor(raw: string): string {
  const n = raw.replace(/[\s\-().+]/g, '')
  if (n.startsWith('62')) return n
  if (n.startsWith('0')) return '62' + n.slice(1)
  if (n.startsWith('8')) return '62' + n
  return n
}

// Ekstrak semua nomor WA dari teks bebas
function extractNomors(text: string): string[] {
  const re = /(?:\+?62|0)[2-9]\d{7,11}/g
  const seen = new Set<string>()
  const raw = text.match(re) || []
  return raw.map(r => normalizeNomor(r)).filter(n => {
    if (seen.has(n) || n.length < 10 || n.length > 15) return false
    seen.add(n)
    return true
  })
}

// GET ?u=username — coba ambil bio dari profil TikTok
export async function GET(req: NextRequest) {
  const u = new URL(req.url).searchParams.get('u')?.trim().replace(/^@/, '').replace(/.*tiktok\.com\/@?/, '')
  if (!u) return NextResponse.json({ error: 'Parameter u wajib diisi' }, { status: 400 })

  try {
    const res = await fetch(`https://www.tiktok.com/@${u}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) return NextResponse.json({ error: `TikTok HTTP ${res.status} — coba mode Paste` }, { status: 502 })

    const html = await res.text()

    // Cari JSON di __UNIVERSAL_DATA_FOR_REHYDRATION__
    const jsonMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1])
        // Cari user info di dalam nested object
        const userInfo = findDeep(data, 'userInfo') || findDeep(data, 'user')
        if (userInfo) {
          const user = userInfo.user || userInfo
          const stats = userInfo.stats
          const nama: string = user.nickname || user.uniqueId || u
          const bio: string = user.signature || ''
          const nomors = extractNomors(bio)
          return NextResponse.json({ nama, bio, nomors, followers: stats?.followerCount ?? null })
        }
      } catch { /* lanjut ke fallback */ }
    }

    // Fallback: cari nomor di seluruh HTML
    const nomors = extractNomors(html)
    if (nomors.length > 0) {
      return NextResponse.json({ nama: u, bio: '', nomors })
    }

    return NextResponse.json({ error: 'TikTok memblokir akses server — gunakan mode Paste Teks' }, { status: 403 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Gagal: ${msg} — coba mode Paste Teks` }, { status: 500 })
  }
}

// POST body: { teks: string } — parse nomor dari teks yang di-paste
export async function POST(req: NextRequest) {
  const { teks } = await req.json()
  if (!teks?.trim()) return NextResponse.json({ error: 'teks wajib diisi' }, { status: 400 })
  const nomors = extractNomors(teks)
  return NextResponse.json({ nomors })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findDeep(obj: any, key: string, depth = 0): any {
  if (depth > 8 || !obj || typeof obj !== 'object') return null
  if (key in obj) return obj[key]
  for (const v of Object.values(obj)) {
    const found = findDeep(v, key, depth + 1)
    if (found) return found
  }
  return null
}
