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
  const token = req.cookies.get(COOKIE_NAME)?.value
  const valid = await isValid(token)

  // Public endpoints
  const isApiAuth = pathname.startsWith('/api/auth/')
  const isHealth = pathname === '/api/health'
  const isLoginPage = pathname === '/login'

  if (isApiAuth || isHealth || isLoginPage) return NextResponse.next()

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
