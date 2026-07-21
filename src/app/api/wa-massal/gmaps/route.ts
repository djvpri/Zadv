import { NextRequest, NextResponse } from 'next/server'

interface PlaceResult {
  id: string
  displayName?: { text: string }
  nationalPhoneNumber?: string
  formattedAddress?: string
}

function normalizeNomor(raw: string): string {
  if (!raw) return ''
  const n = raw.replace(/[\s\-().+]/g, '')
  if (n.startsWith('62')) return n
  if (n.startsWith('0')) return '62' + n.slice(1)
  if (n.startsWith('8')) return '62' + n
  return n
}

export async function GET(req: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    return NextResponse.json(
      { error: 'GOOGLE_PLACES_API_KEY belum diset di Railway environment variables' },
      { status: 503 }
    )
  }

  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Parameter q wajib diisi' }, { status: 400 })

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.nationalPhoneNumber,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: q, languageCode: 'id', maxResultCount: 20 }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json(
      { error: `Google Places API error: ${err.error?.message || res.status}` },
      { status: 502 }
    )
  }

  const data = await res.json()
  const places = ((data.places || []) as PlaceResult[]).map((p) => ({
    id: p.id || '',
    nama: p.displayName?.text || '',
    nomor: normalizeNomor(p.nationalPhoneNumber || ''),
    nomorRaw: p.nationalPhoneNumber || '',
    alamat: p.formattedAddress || '',
  }))

  return NextResponse.json({ places })
}
