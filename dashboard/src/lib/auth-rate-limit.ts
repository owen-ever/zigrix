// IP-based in-memory rate limiter for login endpoint
// Pattern: 5 attempts/min per IP

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_FAILURES = 5;
const BACKOFF_BASE_MS = 15 * 1000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;

type RateLimitState = {
  failures: number;
  firstFailureAtMs: number;
  lockedUntilMs: number;
  lastSeenAtMs: number;
};

const ipStates = new Map<string, RateLimitState>();
const usernameStates = new Map<string, RateLimitState>();

let lastCleanupMs = 0;

function normalizeIp(ip: string): string {
  return (ip || 'unknown').trim().toLowerCase();
}

function normalizeUsername(username: string): string {
  return (username || '').trim().toLowerCase();
}

function cleanup(nowMs: number): void {
  if (nowMs - lastCleanupMs < 60_000) return;
  lastCleanupMs = nowMs;

  const staleAfterMs = Math.max(WINDOW_MS, BACKOFF_MAX_MS) + 60_000;

  ipStates.forEach((state, key) => {
    if (nowMs - state.lastSeenAtMs > staleAfterMs) {
      ipStates.delete(key);
    }
  });

  usernameStates.forEach((state, key) => {
    if (nowMs - state.lastSeenAtMs > staleAfterMs) {
      usernameStates.delete(key);
    }
  });
}

function getActiveState(
  map: Map<string, RateLimitState>,
  key: string,
  nowMs: number,
): RateLimitState | null {
  const state = map.get(key);
  if (!state) return null;

  const windowExpired = nowMs - state.firstFailureAtMs >= WINDOW_MS;
  const lockExpired = state.lockedUntilMs <= nowMs;

  if (windowExpired && lockExpired) {
    map.delete(key);
    return null;
  }

  return state;
}

function bumpFailures(
  map: Map<string, RateLimitState>,
  key: string,
  nowMs: number,
): number | null {
  const existing = map.get(key);
  const state: RateLimitState =
    !existing || nowMs - existing.firstFailureAtMs >= WINDOW_MS
      ? { failures: 0, firstFailureAtMs: nowMs, lockedUntilMs: 0, lastSeenAtMs: nowMs }
      : existing;

  state.failures += 1;
  state.lastSeenAtMs = nowMs;

  if (state.failures > MAX_FAILURES) {
    const exponent = state.failures - MAX_FAILURES - 1;
    const backoffMs = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent);
    state.lockedUntilMs = Math.max(state.lockedUntilMs, nowMs + backoffMs);
  }

  map.set(key, state);
  return state.lockedUntilMs > nowMs ? state.lockedUntilMs : null;
}

export type RateLimitResult = {
  limited: boolean;
  retryAfterSeconds: number;
};

export function checkRateLimit(ip: string, username: string): RateLimitResult {
  const nowMs = Date.now();
  cleanup(nowMs);

  const ipState = getActiveState(ipStates, normalizeIp(ip), nowMs);
  const usernameState = getActiveState(usernameStates, normalizeUsername(username), nowMs);

  const ipRetryAt = ipState && ipState.lockedUntilMs > nowMs ? ipState.lockedUntilMs : null;
  const usernameRetryAt =
    usernameState && usernameState.lockedUntilMs > nowMs ? usernameState.lockedUntilMs : null;

  const retryAtMs = Math.max(ipRetryAt ?? 0, usernameRetryAt ?? 0);

  if (!retryAtMs) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((retryAtMs - nowMs) / 1000)),
  };
}

export function recordFailure(ip: string, username: string): void {
  const nowMs = Date.now();
  cleanup(nowMs);

  bumpFailures(ipStates, normalizeIp(ip), nowMs);
  bumpFailures(usernameStates, normalizeUsername(username), nowMs);
}

export function recordSuccess(ip: string, username: string): void {
  ipStates.delete(normalizeIp(ip));
  usernameStates.delete(normalizeUsername(username));
}
