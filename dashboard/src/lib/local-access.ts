import { NextRequest } from 'next/server';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function normalizeIp(raw: string): string {
  return raw.trim().toLowerCase();
}

function isLoopbackIp(ip: string): boolean {
  const v = normalizeIp(ip);
  if (!v) return false;

  return (
    v === '::1' ||
    v === '[::1]' ||
    v.startsWith('127.') ||
    v.startsWith('::ffff:127.')
  );
}

function firstForwardedIp(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  const xri = request.headers.get('x-real-ip')?.trim();
  if (xri) return xri;

  return null;
}

/**
 * Setup hardening guard:
 * allow admin setup only from loopback (localhost / 127.0.0.1 / ::1).
 */
export function isLocalAccessRequest(request: NextRequest): boolean {
  const forwardedIp = firstForwardedIp(request);
  if (forwardedIp) {
    return isLoopbackIp(forwardedIp);
  }

  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return LOOPBACK_HOSTS.has(hostname);
  } catch {
    return false;
  }
}
