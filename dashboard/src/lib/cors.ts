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
  // This prevents false 403s when dashboard is accessed via non-localhost hosts
  // (e.g. AirMini hostname/IP) before corsOrigins is explicitly configured.
  try {
    const requestOrigin = new URL(request.url).origin;
    if (requestOrigin === origin) {
      return { allowedOrigin: origin, origin };
    }
  } catch {
    // ignore URL parse issues and continue with configured allowlist check
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
