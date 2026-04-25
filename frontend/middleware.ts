import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  const userCookie = request.cookies.get('user')?.value
  const path = request.nextUrl.pathname

  // Public paths
  if (path === '/') return NextResponse.next()

  // Redirect to login if no token
  if (!token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Role-based access
  if (userCookie) {
    const user = JSON.parse(userCookie)
    const role = user.role

    if (path.startsWith('/worker') && role !== 'worker' && role !== 'supervisor') {
      return NextResponse.redirect(new URL(`/${role.replace('_', '-')}`, request.url))
    }
    if (path.startsWith('/accountant') && role !== 'inventory_accountant' && role !== 'supervisor') {
      return NextResponse.redirect(new URL(`/${role}`, request.url))
    }
    if (path.startsWith('/supervisor') && role !== 'supervisor') {
      return NextResponse.redirect(new URL(`/${role.replace('inventory_', '')}`, request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/worker/:path*', '/accountant/:path*', '/supervisor/:path*'],
}
