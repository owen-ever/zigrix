import fs from 'node:fs';
import { NextRequest } from 'next/server';
import { createZigrixStore } from '@/lib/zigrix-store';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const store = createZigrixStore();
const encoder = new TextEncoder();
const SSE_RETRY_MS = 3_000;

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function toSseChunk(
  event: string,
  payload: unknown,
  options?: { id?: string; retryMs?: number },
): Uint8Array {
  const lines: string[] = [];

  if (typeof options?.retryMs === 'number' && options.retryMs > 0) {
    lines.push(`retry: ${Math.floor(options.retryMs)}`);
  }
  if (options?.id) {
    lines.push(`id: ${options.id}`);
  }

  lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(payload)}`);

  return encoder.encode(`${lines.join('\n')}\n\n`);
}

function readFileSignature(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

// ─── lastEventTs recovery ─────────────────────────────────────────────────────

/**
 * Read tasks.jsonl and return events with ts > lastEventTs.
 */
function readMissedEvents(lastEventTs: string): Array<Record<string, unknown>> {
  const raw = (() => {
    try {
      return fs.readFileSync(store.paths.eventsPath, 'utf-8');
    } catch {
      return '';
    }
  })();

  if (!raw.trim()) return [];

  const missed: Array<Record<string, unknown>> = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const ts = parsed.ts;
      if (typeof ts === 'string' && ts > lastEventTs) {
        missed.push(parsed);
      }
    } catch {
      // skip
    }
  }

  return missed;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<Response> {
  // Auth check: SSE handshake must carry valid session cookie
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);

  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const reqUrl = new URL(request.url);
  const taskId = reqUrl.searchParams.get('taskId') || null;
  const lastEventTs = reqUrl.searchParams.get('lastEventTs') || null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let eventSequence = 0;
      const cleanupFns: Array<() => void> = [];

      const send = (event: string, payload: unknown) => {
        if (closed) return;
        eventSequence += 1;
        controller.enqueue(
          toSseChunk(event, payload, {
            id: `${Date.now()}-${eventSequence}`,
            retryMs: SSE_RETRY_MS,
          }),
        );
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;

        for (const stop of cleanupFns) {
          try {
            stop();
          } catch {
            // ignore
          }
        }
        cleanupFns.length = 0;

        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // ─── Event handlers ────────────────────────────────────────────────────

      const handleTasksChange = () => {
        if (closed) return;
        try {
          const overview = store.loadOverview();
          send('event_update', {
            ts: new Date().toISOString(),
            recentEvents: overview.recentEvents,
            taskHistory: overview.taskHistory,
            bucketCounts: overview.bucketCounts,
          });
        } catch {
          // ignore
        }
      };

      let convUpdatePending = false;

      const handleConversationChange = () => {
        if (closed || !taskId || convUpdatePending) return;
        convUpdatePending = true;

        store
          .loadTaskConversation(taskId)
          .then((conv) => {
            convUpdatePending = false;
            if (closed) return;
            send('conversation_update', {
              ts: new Date().toISOString(),
              taskId: conv.taskId,
              sessionKeys: conv.sessionKeys,
              stream: conv.stream,
              recentEvents: conv.recentEvents,
              openclawAvailable: conv.openclawAvailable,
            });
          })
          .catch(() => {
            convUpdatePending = false;
          });
      };

      const handleTaskDetailChange = () => {
        if (closed || !taskId) return;
        try {
          const detail = store.loadTaskDetail(taskId);
          send('task_detail_update', {
            ts: new Date().toISOString(),
            taskId,
            detail,
          });
        } catch {
          // ignore
        }
      };

      // ─── Polling: tasks.jsonl ──────────────────────────────────────────────

      let lastTasksSig = readFileSignature(store.paths.eventsPath);

      const tasksPollTimer = setInterval(() => {
        const next = readFileSignature(store.paths.eventsPath);
        if (next === lastTasksSig) return;
        lastTasksSig = next;
        handleTasksChange();
        handleTaskDetailChange();
      }, 1_000);

      cleanupFns.push(() => clearInterval(tasksPollTimer));

      // ─── Polling: session files (only when taskId provided) ────────────────

      if (taskId) {
        const sessionSigs = new Map<string, string | null>();
        const metaPath = `${store.paths.specsDir}/${taskId}.meta.json`;
        let lastMetaSig = readFileSignature(metaPath);

        const refreshSessionSigs = (): boolean => {
          try {
            const filePaths = store.getTaskSessionFilePaths(taskId);
            let changed = false;
            const nextFilePathSet = new Set(filePaths);

            for (const fp of Array.from(sessionSigs.keys())) {
              if (!nextFilePathSet.has(fp)) {
                sessionSigs.delete(fp);
                changed = true;
              }
            }

            for (const fp of filePaths) {
              const sig = readFileSignature(fp);
              if (!sessionSigs.has(fp) || sessionSigs.get(fp) !== sig) {
                sessionSigs.set(fp, sig);
                changed = true;
              }
            }

            return changed;
          } catch {
            return false;
          }
        };

        // Initialize without triggering update
        refreshSessionSigs();

        const sessionPollTimer = setInterval(() => {
          const changed = refreshSessionSigs();
          if (changed) handleConversationChange();
        }, 1_000);

        cleanupFns.push(() => clearInterval(sessionPollTimer));

        const evidenceDir = `${store.paths.evidenceDir}/${taskId}`;

        const readEvidenceSig = (): string | null => {
          try {
            if (!fs.existsSync(evidenceDir)) return null;
            const files = fs.readdirSync(evidenceDir).filter((f: string) => f.endsWith('.json'));
            return files
              .map((f: string) => `${f}:${readFileSignature(`${evidenceDir}/${f}`)}`)
              .join('|');
          } catch {
            return null;
          }
        };

        let lastEvidenceSig = readEvidenceSig();

        const metaPollTimer = setInterval(() => {
          let changed = false;

          const nextMetaSig = readFileSignature(metaPath);
          if (nextMetaSig !== lastMetaSig) {
            lastMetaSig = nextMetaSig;
            changed = true;
          }

          const nextEvidenceSig = readEvidenceSig();
          if (nextEvidenceSig !== lastEvidenceSig) {
            lastEvidenceSig = nextEvidenceSig;
            changed = true;
          }

          if (!changed) return;
          handleTaskDetailChange();
          handleConversationChange();
        }, 1_000);

        cleanupFns.push(() => clearInterval(metaPollTimer));
      }

      // ─── Heartbeat ─────────────────────────────────────────────────────────

      const heartbeatTimer = setInterval(() => {
        send('ping', { ts: new Date().toISOString() });
      }, 15_000);

      cleanupFns.push(() => clearInterval(heartbeatTimer));

      // ─── Abort cleanup ──────────────────────────────────────────────────────

      const onAbort = () => cleanup();
      request.signal.addEventListener('abort', onAbort, { once: true });
      cleanupFns.push(() => request.signal.removeEventListener('abort', onAbort));

      // ─── Initial payload / reconnection recovery ───────────────────────────

      if (lastEventTs) {
        // Reconnecting: send missed events since lastEventTs
        try {
          const missedEvents = readMissedEvents(lastEventTs);
          if (missedEvents.length > 0) {
            // Push overview update with missed events context
            const overview = store.loadOverview();
            send('event_update', {
              ts: new Date().toISOString(),
              recentEvents: overview.recentEvents,
              taskHistory: overview.taskHistory,
              bucketCounts: overview.bucketCounts,
              missedEvents,
            });
          } else {
            // No missed events — still send current state
            const overview = store.loadOverview();
            send('event_update', {
              ts: new Date().toISOString(),
              recentEvents: overview.recentEvents,
              taskHistory: overview.taskHistory,
              bucketCounts: overview.bucketCounts,
            });
          }
        } catch {
          // fallback to full update
          try {
            const overview = store.loadOverview();
            send('update', {
              ts: new Date().toISOString(),
              reason: 'reconnect_fallback',
              overview,
            });
          } catch {
            // ignore
          }
        }
      } else {
        // Fresh connection: send full overview
        try {
          const overview = store.loadOverview();
          send('update', {
            ts: new Date().toISOString(),
            reason: 'initial',
            overview,
            latestEvent: overview.recentEvents[0] || null,
            refresh: {
              overview: true,
              recentEvents: true,
              taskIds: [],
              conversationTaskIds: taskId ? [taskId] : [],
            },
          });
        } catch {
          // ignore
        }
      }

      // Initial conversation if taskId provided
      if (taskId) {
        handleConversationChange();
      }
    },
    cancel() {
      // Cleanup driven by request abort signal
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
