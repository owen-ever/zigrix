import fs from 'node:fs';
import path from 'node:path';

export function nowIso(): string {
  return new Date().toISOString();
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
        return [parsed];
      } catch {
        return [];
      }
    });
}
