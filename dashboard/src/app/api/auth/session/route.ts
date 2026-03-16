import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { applyCors, handleCorsPreflight, rejectDisallowedOrigin } from '@/lib/cors';

export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflight(request, ['GET', 'OPTIONS']);
}

export async function GET(request: NextRequest): Promise<Response> {
  const blocked = rejectDisallowedOrigin(request);
  if (blocked) return blocked;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);

  if (!session) {
    return applyCors(request, NextResponse.json({ authenticated: false }, { status: 401 }));
  }

  return applyCors(
    request,
    NextResponse.json({
      authenticated: true,
      username: session.username,
      issuedAt: new Date(session.issuedAt * 1000).toISOString(),
      expiresAt: new Date(session.expiresAt * 1000).toISOString(),
    }),
  );
}
