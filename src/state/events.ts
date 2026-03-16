import fs from 'node:fs';
import path from 'node:path';

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Normalize a legacy event to the standard envelope.
 * - `timestamp` → `ts`
 * - top-level `agentId`/`reason` → payload
 */
function normalizeEvent(raw: Record<string, unknown>): Record<string, unknown> {
  const event = { ...raw };

  // timestamp → ts
  if ('timestamp' in event && !('ts' in event)) {
    event.ts = event.timestamp;
    delete event.timestamp;
  }

  // Ensure payload exists
  if (!event.payload || typeof event.payload !== 'object') {
    event.payload = {};
  }
  const payload = event.payload as Record<string, unknown>;

  // Move top-level agentId/reason into payload if not already there
  if ('agentId' in event && event.agentId !== undefined && !('agentId' in payload)) {
    payload.agentId = event.agentId;
  }
  if ('reason' in event && event.reason !== undefined && !('reason' in payload)) {
    payload.reason = event.reason;
  }

  return event;
}

export function appendEvent(eventsFile: string, event: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...event, ts: event.ts ?? nowIso() };
  fs.mkdirSync(path.dirname(eventsFile), { recursive: true });
  fs.appendFileSync(eventsFile, `${JSON.stringify(payload)}\n`, 'utf8');
  return payload;
}

export function loadEvents(eventsFile: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(eventsFile)) return [];
  return fs.readFileSync(eventsFile, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        return [normalizeEvent(parsed)];
      } catch {
        return [];
      }
    });
}
