import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const COOKIE_NAME = 'zadv_session'

async function isValid(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const secret = process.env.JWT_SECRET
  if (!secret) return false
  try {
    await jwtVerify(token, new TextEncoder().encode(secret))
    return true
  } catch {
    return false
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // /api/music dan /api/video melewati upload file besar — skip middleware agar tidak melewati
  // Edge runtime yang punya batas body kecil. Auth dicek manual di route-nya.
  if (pathname.startsWith('/api/music')) return NextResponse.next()
  if (pathname.startsWith('/api/video')) return NextResponse.next()

  const token = req.cookies.get(COOKIE_NAME)?.value
  const valid = await isValid(token)

  // Public endpoints
  const isApiAuth = pathname.startsWith('/api/auth/')
  const isHealth = pathname === '/api/health'
  const isLoginPage = pathname === '/login'
  // Cross-app: GET /api/apps + POST /api/artikel/trigger boleh diakses
  // GH Actions cron / Z lain kalau header X-Cross-App-Secret cocok.
  const crossSecretOk = !!process.env.CROSS_APP_SECRET
    && req.headers.get('x-cross-app-secret') === process.env.CROSS_APP_SECRET
  const isCrossApps = pathname === '/api/apps' && req.method === 'GET' && crossSecretOk
  const isCrossTrigger = pathname === '/api/artikel/trigger' && req.method === 'POST' && crossSecretOk
  // Public artikel API: landing page app fetch /api/artikel/publik tanpa auth.
  const isPublicArtikel = pathname.startsWith('/api/artikel/publik') && req.method === 'GET'

  if (isApiAuth || isHealth || isLoginPage || isCrossApps || isCrossTrigger || isPublicArtikel) {
    // CORS untuk public artikel API — allow *.zomet.my.id
    if (isPublicArtikel) {
      const origin = req.headers.get('origin') || ''
      if (origin.endsWith('.zomet.my.id') || origin === 'https://zomet.my.id') {
        const res = NextResponse.next()
        res.headers.set('Access-Control-Allow-Origin', origin)
        res.headers.set('Access-Control-Allow-Methods', 'GET')
        res.headers.set('Access-Control-Max-Age', '86400')
        return res
      }
    }
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    if (!valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.next()
  }

  if (pathname.startsWith('/app')) {
    if (!valid) return NextResponse.redirect(new URL('/login', req.url))
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/app/:path*', '/api/:path*'],
}
