import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME, isSetupRequired } from '@/lib/auth';
import { isLocalAccessRequest } from '@/lib/local-access';

// Paths that don't require authentication
const PUBLIC_API_PATHS = ['/api/auth/setup', '/api/auth/login'];

export const runtime = 'nodejs';

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and Next.js internals
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const setupRequired = isSetupRequired();
  const localAccess = isLocalAccessRequest(request);

  const isSetupPage = pathname === '/setup' || pathname.startsWith('/setup/');
  const isLoginPage = pathname === '/login' || pathname.startsWith('/login/');

  // Public auth APIs always pass through (route handlers enforce setup state).
  if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Before initial setup, block remote page access entirely.
  // Admin setup must happen from local/private network access.
  if (setupRequired && !localAccess && !pathname.startsWith('/api/')) {
    return new NextResponse('Dashboard setup is allowed only from local/private network access.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Setup flow routing
  if (isSetupPage) {
    if (setupRequired) return NextResponse.next();

    // Setup already done: bounce away from /setup.
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = await verifySession(token);
    return NextResponse.redirect(new URL(session ? '/' : '/login', request.url));
  }

  if (isLoginPage) {
    // First-time users should be sent to /setup, not /login.
    if (setupRequired) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }
    return NextResponse.next();
  }

  // Get session token from cookie
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);

  // API routes: return 401 if not authenticated
  if (pathname.startsWith('/api/')) {
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Page routes: redirect based on setup/auth state
  if (!session) {
    if (setupRequired) {
      return NextResponse.redirect(new URL('/setup', request.url));
    }

    const loginUrl = new URL('/login', request.url);
    // Preserve the original destination for post-login redirect
    if (pathname !== '/' && !isLoginPage) {
      loginUrl.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
