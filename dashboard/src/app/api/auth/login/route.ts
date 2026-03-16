import { NextRequest, NextResponse } from 'next/server';
import {
  verifyPassword,
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  isSetupRequired,
} from '@/lib/auth';
import { checkRateLimit, recordFailure, recordSuccess } from '@/lib/auth-rate-limit';
import { applyCors, handleCorsPreflight, rejectDisallowedOrigin } from '@/lib/cors';

export const runtime = 'nodejs';

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflight(request, ['POST', 'OPTIONS']);
}

export async function POST(request: NextRequest): Promise<Response> {
  const blocked = rejectDisallowedOrigin(request);
  if (blocked) return blocked;

  if (isSetupRequired()) {
    return applyCors(request, NextResponse.json({ error: 'Setup required' }, { status: 403 }));
  }

  const ip = getClientIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return applyCors(request, NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return applyCors(request, NextResponse.json({ error: 'Invalid request body' }, { status: 400 }));
  }

  const { username, password } = body as Record<string, unknown>;

  if (typeof username !== 'string' || !username.trim()) {
    return applyCors(request, NextResponse.json({ error: 'username is required' }, { status: 400 }));
  }

  if (typeof password !== 'string') {
    return applyCors(request, NextResponse.json({ error: 'password is required' }, { status: 400 }));
  }

  const usernameNormalized = username.trim();

  const rateLimit = checkRateLimit(ip, usernameNormalized);
  if (rateLimit.limited) {
    return applyCors(
      request,
      NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      ),
    );
  }

  const valid = await verifyPassword(usernameNormalized, password);

  if (!valid) {
    recordFailure(ip, usernameNormalized);
    return applyCors(request, NextResponse.json({ error: 'Invalid credentials' }, { status: 401 }));
  }

  recordSuccess(ip, usernameNormalized);

  const token = await createSession(usernameNormalized);

  const response = NextResponse.json({ ok: true, username: usernameNormalized });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  });

  return applyCors(request, response);
}
