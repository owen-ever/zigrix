import { NextRequest } from 'next/server';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function normalizeIp(raw: string): string {
  return raw.trim().toLowerCase();
}

function stripBrackets(ip: string): string {
  if (ip.startsWith('[') && ip.endsWith(']')) {
    return ip.slice(1, -1);
  }
  return ip;
}

function normalizeHost(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const noPort = trimmed.includes(':') && !trimmed.startsWith('[')
    ? trimmed.split(':')[0]
    : trimmed;
  return stripBrackets(noPort);
}

function isLoopbackIp(ip: string): boolean {
  const v = stripBrackets(normalizeIp(ip));
  if (!v) return false;

  return v === '::1' || v.startsWith('127.') || v.startsWith('::ffff:127.');
}

function isPrivateIpv4(ip: string): boolean {
  const v = stripBrackets(normalizeIp(ip));
  const m = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;

  const a = Number(m[1]);
  const b = Number(m[2]);
  if ([a, b].some(Number.isNaN)) return false;

  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function isPrivateIpv6(ip: string): boolean {
  const v = stripBrackets(normalizeIp(ip));
  return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80:');
}

function isLoopbackOrPrivateIp(ip: string): boolean {
  return isLoopbackIp(ip) || isPrivateIpv4(ip) || isPrivateIpv6(ip);
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
 * allow admin setup only from local/private network access.
 */
export function isLocalAccessRequest(request: NextRequest): boolean {
  const forwardedIp = firstForwardedIp(request);
  if (forwardedIp) {
    return isLoopbackOrPrivateIp(forwardedIp);
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const host = normalizeHost(forwardedHost.split(',')[0] || forwardedHost);
    if (LOOPBACK_HOSTS.has(host) || isLoopbackOrPrivateIp(host) || host.endsWith('.local')) {
      return true;
    }
  }

  const hostHeader = request.headers.get('host');
  if (hostHeader) {
    const host = normalizeHost(hostHeader);
    if (LOOPBACK_HOSTS.has(host) || isLoopbackOrPrivateIp(host) || host.endsWith('.local')) {
      return true;
    }
  }

  try {
    const hostname = normalizeHost(new URL(request.url).hostname);
    return LOOPBACK_HOSTS.has(hostname) || isLoopbackOrPrivateIp(hostname) || hostname.endsWith('.local');
  } catch {
    return false;
  }
}
