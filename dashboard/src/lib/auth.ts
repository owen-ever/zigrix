import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  readCanonicalConfigSnapshot,
  resolveConfiguredBaseDir,
} from './zigrix-config';

// ─── Constants ────────────────────────────────────────────────────────────────

export const SESSION_COOKIE_NAME = 'zigrix_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const BCRYPT_COST = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type BcryptLike = {
  hash(password: string, saltRounds: number): Promise<string>;
  compare(password: string, passwordHash: string): Promise<boolean>;
};

async function loadBcrypt(): Promise<BcryptLike> {
  const mod = await import('bcryptjs');
  const candidate = ((mod as { default?: unknown }).default ?? mod) as Partial<BcryptLike>;
  if (typeof candidate.hash !== 'function' || typeof candidate.compare !== 'function') {
    throw new Error('bcryptjs adapter unavailable');
  }
  return candidate as BcryptLike;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminEntry = {
  username: string;
  passwordHash: string;
};

export type DashboardConfig = {
  admins: AdminEntry[];
  sessionSecret: string;
  corsOrigins: string[];
  createdAt: string;
};

export type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
};

export type VerifiedSession = {
  username: string;
  issuedAt: number;
  expiresAt: number;
};

// ─── Paths ───────────────────────────────────────────────────────────────────

type ZigrixAuthConfigSnapshot = {
  paths?: {
    baseDir?: string;
  };
};

function readConfigSnapshot(): ZigrixAuthConfigSnapshot | null {
  return readCanonicalConfigSnapshot<ZigrixAuthConfigSnapshot>();
}

function getDashboardConfigPath(): string {
  const snapshot = readConfigSnapshot();
  return path.join(resolveConfiguredBaseDir(snapshot?.paths?.baseDir), 'dashboard.json');
}

// ─── Config ──────────────────────────────────────────────────────────────────

export function getDashboardConfig(): DashboardConfig {
  const configPath = getDashboardConfigPath();
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { admins: [], sessionSecret: '', corsOrigins: [], createdAt: '' };
    }
    const obj = parsed as Record<string, unknown>;
    return {
      admins: Array.isArray(obj.admins) ? (obj.admins as AdminEntry[]) : [],
      sessionSecret: typeof obj.sessionSecret === 'string' ? obj.sessionSecret : '',
      corsOrigins: Array.isArray(obj.corsOrigins) ? (obj.corsOrigins as string[]) : [],
      createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : '',
    };
  } catch {
    return { admins: [], sessionSecret: '', corsOrigins: [], createdAt: '' };
  }
}

export function isSetupRequired(): boolean {
  const config = getDashboardConfig();
  return config.admins.length === 0;
}

export async function setupAdmin(username: string, password: string): Promise<void> {
  const bcrypt = await loadBcrypt();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const sessionSecret = crypto.randomBytes(64).toString('hex');

  const config: DashboardConfig = {
    admins: [{ username, passwordHash }],
    sessionSecret,
    corsOrigins: ['http://localhost:3000'],
    createdAt: new Date().toISOString(),
  };

  const configPath = getDashboardConfigPath();
  const dashboardDir = path.dirname(configPath);

  // Ensure directory exists
  if (!fs.existsSync(dashboardDir)) {
    fs.mkdirSync(dashboardDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });

  // Ensure permissions
  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    // ignore on non-unix
  }
}

// ─── Password Verification ────────────────────────────────────────────────────

export async function verifyPassword(username: string, password: string): Promise<boolean> {
  const bcrypt = await loadBcrypt();
  const config = getDashboardConfig();
  const admin = config.admins.find((a) => a.username === username);
  if (!admin) {
    // Run bcrypt anyway to prevent timing attacks
    await bcrypt.hash(password, BCRYPT_COST);
    return false;
  }

  const isValid = await bcrypt.compare(password, admin.passwordHash);
  if (!isValid) return false;

  // Additional timing-safe comparison of usernames
  const expectedBytes = encoder.encode(username);
  const actualBytes = encoder.encode(admin.username);

  if (expectedBytes.length !== actualBytes.length) return false;

  return crypto.timingSafeEqual(expectedBytes, actualBytes);
}

// ─── Session Token ────────────────────────────────────────────────────────────

function base64UrlEncode(input: Uint8Array): string {
  const buf = Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  return crypto.timingSafeEqual(aBytes, bBytes);
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createSession(username: string): Promise<string> {
  const config = getDashboardConfig();
  const secret = config.sessionSecret;

  if (!secret) {
    throw new Error('Session secret not configured. Run setup first.');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };

  const payloadEncoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await signPayload(payloadEncoded, secret);

  return `${payloadEncoded}.${signature}`;
}

export async function verifySession(token: string | undefined): Promise<VerifiedSession | null> {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadEncoded, tokenSignature] = parts;
  if (!payloadEncoded || !tokenSignature) return null;

  const config = getDashboardConfig();
  const secret = config.sessionSecret;

  if (!secret) return null;

  const expectedSignature = await signPayload(payloadEncoded, secret);
  if (!timingSafeEqualStrings(expectedSignature, tokenSignature)) return null;

  let payload: SessionPayload;
  try {
    const payloadJson = decoder.decode(base64UrlDecode(payloadEncoded));
    payload = JSON.parse(payloadJson) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;
  if (payload.iat > now + 60) return null;

  return {
    username: typeof payload.sub === 'string' ? payload.sub : '',
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}
