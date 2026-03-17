import { NextRequest, NextResponse } from 'next/server';
import { getDashboardConfig } from '@/lib/auth';

const DEFAULT_ALLOW_HEADERS = 'Content-Type, Authorization';
const DEFAULT_MAX_AGE_SECONDS = 600;

function parseAllowedOrigins(): string[] {
  const config = getDashboardConfig();
  const seen = new Set<string>();

  for (const raw of config.corsOrigins) {
    if (typeof raw !== 'string') continue;
    const origin = raw.trim();
    if (!origin || origin === '*') continue;
    seen.add(origin);
  }

  return Array.from(seen);
}

function resolveAllowedOrigin(request: Request): { allowedOrigin: string | null; origin: string | null } {
  const origin = request.headers.get('origin');
  if (!origin) return { allowedOrigin: null, origin: null };

  // Always allow same-origin requests.
  // In proxied deployments request.url may be internal, so we also reconstruct
  // candidate external origins from forwarded headers.
  const sameOriginCandidates = new Set<string>();
  try {
    sameOriginCandidates.add(new URL(request.url).origin);
  } catch {
    // ignore URL parse issues and continue
  }

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const host = request.headers.get('host')?.trim();

  if (forwardedHost && forwardedProto) {
    sameOriginCandidates.add(`${forwardedProto}://${forwardedHost}`);
  }
  if (host) {
    sameOriginCandidates.add(`https://${host}`);
    sameOriginCandidates.add(`http://${host}`);
  }

  if (sameOriginCandidates.has(origin)) {
    return { allowedOrigin: origin, origin };
  }

  const allowedOrigins = parseAllowedOrigins();
  const allowedOrigin = allowedOrigins.find((candidate) => candidate === origin) || null;
  return { allowedOrigin, origin };
}

function withVaryOrigin(headers: Headers): void {
  const current = headers.get('Vary');
  if (!current) {
    headers.set('Vary', 'Origin');
    return;
  }

  const entries = current
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!entries.includes('Origin')) {
    entries.push('Origin');
    headers.set('Vary', entries.join(', '));
  }
}

export function rejectDisallowedOrigin(request: NextRequest): NextResponse | null {
  const { allowedOrigin, origin } = resolveAllowedOrigin(request);
  if (!origin || allowedOrigin) return null;

  const response = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  withVaryOrigin(response.headers);
  return response;
}

export function applyCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  withVaryOrigin(headers);

  const { allowedOrigin } = resolveAllowedOrigin(request);
  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handleCorsPreflight(
  request: NextRequest,
  methods: string[],
): NextResponse {
  const { allowedOrigin, origin } = resolveAllowedOrigin(request);

  if (origin && !allowedOrigin) {
    const blocked = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    withVaryOrigin(blocked.headers);
    return blocked;
  }

  const response = new NextResponse(null, { status: 204 });
  withVaryOrigin(response.headers);

  if (!allowedOrigin) {
    return response;
  }

  const requestHeaders = request.headers.get('access-control-request-headers');
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', methods.join(', '));
  response.headers.set('Access-Control-Allow-Headers', requestHeaders || DEFAULT_ALLOW_HEADERS);
  response.headers.set('Access-Control-Max-Age', String(DEFAULT_MAX_AGE_SECONDS));

  return response;
}
