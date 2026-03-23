import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── Paths ────────────────────────────────────────────────────────────────────

function getZigrixHome(): string {
  return process.env.ZIGRIX_HOME || path.join(os.homedir(), '.zigrix');
}

const DEFAULT_OPENCLAW_AGENTS_DIR = path.join(os.homedir(), '.openclaw', 'agents');
const DEFAULT_SUBAGENT_RUNS_PATH = path.join(os.homedir(), '.openclaw', 'subagents', 'runs.json');
const DEFAULT_OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:18789';
const DEFAULT_SESSIONS_HISTORY_LIMIT = 200;

// ─── Zigrix config openclaw section reader ────────────────────────────────────

function readZigrixOpenClawConfig(zigrixHome: string): {
  home: string;
  binPath: string | null;
  gatewayUrl: string;
} | null {
  const configPath = path.join(zigrixHome, 'zigrix.config.json');
  try {
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return null;
    const oc = parsed.openclaw;
    if (!isObject(oc)) return null;
    return {
      home: typeof oc.home === 'string' && oc.home ? oc.home : '',
      binPath: typeof oc.binPath === 'string' && oc.binPath ? oc.binPath : null,
      gatewayUrl: typeof oc.gatewayUrl === 'string' && oc.gatewayUrl ? oc.gatewayUrl : DEFAULT_GATEWAY_URL,
    };
  } catch {
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type LooseRecord = Record<string, unknown>;

type ZigrixEvent = {
  ts?: string;
  taskId?: string;
  event?: string;
  action?: string;
  status?: string;
  scale?: string;
  actor?: string;
  agentId?: string;
  targetAgent?: string;
  title?: string;
  sessionKey?: string;
  runId?: string;
  sessionId?: string;
  phase?: string;
  workPackage?: string;
  unitId?: string;
  projectKey?: string;
  payload?: LooseRecord;
  orchestrator?: { agentId?: string };
  workers?: Array<{ agentId?: string }>;
  [key: string]: unknown;
};

export type ZigrixTaskHistoryRow = {
  taskId: string;
  ts: string | null;
  event: string | null;
  status: string | null;
  scale: string | null;
  actor: string | null;
};

export type ZigrixOverviewData = {
  generatedAt: string;
  source?: {
    indexPath: string;
    eventsPath: string;
    specsDir: string;
    evidenceDir: string;
    agentsStateDir: string;
    subagentRunsPath: string;
    openclawConfigPath: string;
  };
  updatedAt: string | null;
  bucketCounts: Record<string, number>;
  statusBuckets: Record<string, unknown[]>;
  activeTasks: Array<{
    taskId: string;
    status: string | null;
    updatedAt: string | null;
    scale: string | null;
    title: string | null;
  }>;
  recentEvents: Array<{
    ts?: string;
    event?: string;
    taskId?: string;
    status?: string;
    actor?: string;
    agentId?: string;
    targetAgent?: string;
    title?: string;
  }>;
  taskHistory: ZigrixTaskHistoryRow[];
  openclawAvailable: boolean;
};

export type ZigrixTaskDetailData = {
  generatedAt: string;
  task: {
    taskId: string;
    status: string | null;
    scale: string | null;
    title: string | null;
    updatedAt: string | null;
    latestEvent: string | null;
    events: ZigrixEvent[];
  };
  spec: {
    exists: boolean;
    path: string;
    metadata: Record<string, string>;
    nextAction: string | null;
    resumeHint: string | null;
    preview?: string;
  };
  meta: {
    exists: boolean;
    path: string;
    data: LooseRecord;
  };
  evidence: {
    exists: boolean;
    path: string;
    agents: Array<{
      file: string;
      path: string;
      agentId: string;
      runId: string | null;
      sessionKey: string | null;
      sessionId: string | null;
      ts: string | null;
    }>;
    merged: (LooseRecord & { path?: string }) | null;
  };
};

export type ZigrixConversationEventRow = {
  ts: string | null;
  event: string | null;
  status: string | null;
  actor: string | null;
  targetAgent: string | null;
  runId: string | null;
  sessionKey: string | null;
};

export type ZigrixConversationStreamMessage = {
  sessionKey: string;
  agentId: string;
  agentName: string;
  role: string | null;
  timestamp: number | null;
  ts: string | null;
  toolName: string | null;
  toolCallId: string | null;
  isError: boolean;
  content: unknown;
  raw: LooseRecord;
};

export type ZigrixSessionHistoryFetchMeta = {
  sessionKey: string;
  ok: boolean;
  messageCount: number;
  error: string | null;
};

export type ZigrixTaskConversationData = {
  generatedAt: string;
  taskId: string;
  sessionKeys: string[];
  stream: ZigrixConversationStreamMessage[];
  recentEvents: ZigrixConversationEventRow[];
  sessions: ZigrixSessionHistoryFetchMeta[];
  openclawAvailable: boolean;
};

type ToolInvoker = (tool: string, args: LooseRecord) => Promise<unknown>;

// ─── Utilities ────────────────────────────────────────────────────────────────

function safeReadText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function readJson(filePath: string, fallback: LooseRecord = {}): LooseRecord {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return isObject(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readJsonl(filePath: string): ZigrixEvent[] {
  const raw = safeReadText(filePath);
  if (!raw.trim()) return [];

  const rows: ZigrixEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isObject(parsed)) rows.push(normalizeEvent(parsed));
    } catch {
      // skip malformed
    }
  }
  return rows;
}

function sortByTsDesc<T extends { ts?: string }>(rows: T[]): T[] {
  return rows
    .map((row, idx) => ({ row, idx }))
    .sort((a, b) => {
      const tsA = Date.parse(a.row.ts || '');
      const tsB = Date.parse(b.row.ts || '');
      const tsCmp = (isNaN(tsB) ? 0 : tsB) - (isNaN(tsA) ? 0 : tsA);
      if (tsCmp !== 0) return tsCmp;
      return b.idx - a.idx;
    })
    .map((item) => item.row);
}

function isObject(value: unknown): value is LooseRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoFromUnknownTimestamp(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return new Date(asNumber).toISOString();
    const asDate = Date.parse(trimmed);
    if (Number.isFinite(asDate)) return new Date(asDate).toISOString();
  }
  return null;
}

function normalizeEvent(raw: LooseRecord): ZigrixEvent {
  const ts = toNonEmptyString(raw.ts) ?? toIsoFromUnknownTimestamp(raw.timestamp) ?? undefined;
  const event = toNonEmptyString(raw.event) ?? toNonEmptyString(raw.action) ?? undefined;
  const sessionKey =
    toNonEmptyString(raw.sessionKey) ??
    toNonEmptyString(raw.session_key) ??
    toNonEmptyString(raw.childSessionKey) ??
    undefined;
  const runId = toNonEmptyString(raw.runId) ?? toNonEmptyString(raw.run_id) ?? undefined;
  return { ...(raw as ZigrixEvent), ts, event, sessionKey, runId };
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

// ─── Agent list from zigrix.config.json ──────────────────────────────────────

function readAgentIds(zigrixHome: string): string[] {
  const configPath = path.join(zigrixHome, 'zigrix.config.json');
  const config = readJson(configPath, {});

  // agents may be array or registry object
  const agents = config.agents;
  if (Array.isArray(agents)) {
    return agents
      .map((a) => {
        if (typeof a === 'string') return a;
        if (isObject(a)) return toNonEmptyString(a.id) || toNonEmptyString(a.agentId);
        return null;
      })
      .filter((id): id is string => !!id);
  }

  if (isObject(agents)) {
    // New config structure: { registry: { "pro-zig": {...}, ... }, orchestration: {...} }
    if (isObject(agents.registry)) {
      return Object.keys(agents.registry);
    }
    // Legacy flat map: { "pro-zig": {...}, "back-zig": {...} }
    return Object.keys(agents);
  }

  return [];
}

// ─── Task status inference ────────────────────────────────────────────────────

function toTaskHistoryStatusEvent(event: ZigrixEvent): string | null {
  const eventName = String(event.event || event.action || '');
  if (eventName === 'task_created') return 'OPEN';
  if (eventName === 'task_started') return 'IN_PROGRESS';
  if (eventName === 'reported') return 'REPORTED';
  if (eventName === 'blocked') return 'BLOCKED';
  if (
    eventName === 'evidence_merged' &&
    String(event.status || '').toUpperCase() === 'DONE_PENDING_REPORT'
  ) {
    return 'DONE_PENDING_REPORT';
  }
  return null;
}

function inferTaskStatus(events: ZigrixEvent[]): string | null {
  const sorted = sortByTsDesc(events);

  for (const event of sorted) {
    const inferred = toTaskHistoryStatusEvent(event);
    if (inferred) return inferred;

    const eventName = String(event.event || event.action || '');
    if (
      ['worker_dispatched', 'worker_started', 'worker_done', 'worker_skipped', 'evidence_collected'].includes(
        eventName,
      )
    ) {
      continue;
    }

    const directStatus = toNonEmptyString(event.status);
    if (directStatus) return directStatus;
  }

  return null;
}

// ─── Task status: meta.json SoT ───────────────────────────────────────────────

function resolveTaskStatus(taskId: string, events: ZigrixEvent[], specsDir: string): string | null {
  const metaPath = path.join(specsDir, `${taskId}.meta.json`);
  const meta = readJson(metaPath, {});
  const metaStatus = toNonEmptyString(meta.status);
  if (metaStatus) return metaStatus;

  const taskEvents = events.filter((e) => e.taskId === taskId);
  return inferTaskStatus(taskEvents);
}

// ─── Lightweight merge comparison ─────────────────────────────────────────────

export type EventSignature = {
  eventCount: number;
  lastTimestamp: string | null;
};

export function getEventSignature(events: ZigrixEvent[]): EventSignature {
  const sorted = sortByTsDesc(events);
  return {
    eventCount: events.length,
    lastTimestamp: sorted[0]?.ts ?? null,
  };
}

export function eventSignaturesEqual(a: EventSignature, b: EventSignature): boolean {
  return a.eventCount === b.eventCount && a.lastTimestamp === b.lastTimestamp;
}

// ─── Index ───────────────────────────────────────────────────────────────────

function normalizeIndex(index: LooseRecord = {}): {
  updatedAt: string | null;
  statusBuckets: Record<string, unknown[]>;
  activeTasks: LooseRecord;
  recentEvents: unknown[];
} {
  const baseBuckets: Record<string, unknown[]> = {
    OPEN: [],
    IN_PROGRESS: [],
    BLOCKED: [],
    DONE_PENDING_REPORT: [],
    REPORTED: [],
  };
  const rawBuckets = isObject(index.statusBuckets) ? index.statusBuckets : {};
  const statusBuckets: Record<string, unknown[]> = { ...baseBuckets };
  for (const [key, value] of Object.entries(rawBuckets)) {
    statusBuckets[key] = Array.isArray(value) ? value : [];
  }
  return {
    updatedAt: typeof index.updatedAt === 'string' ? index.updatedAt : null,
    statusBuckets,
    activeTasks: isObject(index.activeTasks) ? index.activeTasks : {},
    recentEvents: Array.isArray(index.recentEvents) ? index.recentEvents : [],
  };
}

// ─── Task Snapshot ────────────────────────────────────────────────────────────

function buildTaskSnapshot(
  taskId: string,
  events: ZigrixEvent[],
  specsDir: string,
): {
  taskId: string;
  status: string | null;
  scale: string | null;
  title: string | null;
  updatedAt: string | null;
  latestEvent: string | null;
  events: ZigrixEvent[];
} {
  const taskEvents = events.filter((e) => e.taskId === taskId);

  let latest: (ZigrixEvent & { __idx: number }) | null = null;
  let latestScale: string | null = null;
  let latestTitle: string | null = null;

  for (let i = 0; i < taskEvents.length; i++) {
    const candidate = taskEvents[i];
    const candidateTs = String(candidate.ts || '');
    const latestTs = String(latest?.ts || '');

    if (!latest || candidateTs > latestTs || (candidateTs === latestTs && i >= latest.__idx)) {
      latest = { ...candidate, __idx: i };
    }

    if (typeof candidate.scale === 'string' && candidate.scale) latestScale = candidate.scale;
    if (typeof candidate.title === 'string' && candidate.title) latestTitle = candidate.title;
    if (!latestScale && isObject(candidate.payload) && typeof candidate.payload.scale === 'string')
      latestScale = candidate.payload.scale as string;
    if (!latestTitle && isObject(candidate.payload) && typeof candidate.payload.title === 'string')
      latestTitle = candidate.payload.title as string;
  }

  const indices = taskEvents.map((_, i) => i);
  indices.sort((a, b) => {
    const tsCmp = String(taskEvents[b].ts || '').localeCompare(String(taskEvents[a].ts || ''));
    if (tsCmp !== 0) return tsCmp;
    return b - a;
  });
  const sortedEvents = indices.map((i) => taskEvents[i]);

  return {
    taskId,
    status: resolveTaskStatus(taskId, events, specsDir),
    scale: latestScale || latest?.scale || null,
    title: latestTitle || latest?.title || null,
    updatedAt: latest?.ts || null,
    latestEvent: latest?.event || null,
    events: sortedEvents.slice(0, 50),
  };
}

// ─── Task History ─────────────────────────────────────────────────────────────

function buildTaskHistory(events: ZigrixEvent[], specsDir: string): ZigrixTaskHistoryRow[] {
  const tasks = new Map<string, ZigrixTaskHistoryRow>();
  const sorted = sortByTsDesc(events);

  for (const event of sorted) {
    const taskId = event.taskId;
    if (!taskId || tasks.has(taskId)) continue;

    const statusEvent = sorted.find(
      (candidate) => candidate.taskId === taskId && !!toTaskHistoryStatusEvent(candidate),
    );

    tasks.set(taskId, {
      taskId,
      ts: event.ts || null,
      event: event.event || event.action || null,
      status: resolveTaskStatus(taskId, events, specsDir),
      scale: event.scale || null,
      actor: event.actor || event.agentId || null,
    });

    // Suppress unused variable warning
    void statusEvent;
  }

  return Array.from(tasks.values());
}

// ─── Spec Parsing ────────────────────────────────────────────────────────────

function parseSpecSummary(
  taskId: string,
  specsDir: string,
): ZigrixTaskDetailData['spec'] {
  const specPath = path.join(specsDir, `${taskId}.md`);
  const raw = safeReadText(specPath);
  const meta = readJson(path.join(specsDir, `${taskId}.meta.json`), {});
  const lines = raw ? raw.split(/\r?\n/) : [];

  const metadata: Record<string, string> = {};
  const metadataFromMeta: Array<[string, unknown]> = [
    ['taskId', meta.taskId],
    ['title', meta.title],
    ['scale', meta.scale],
    ['requestedBy', meta.requestedBy],
    ['createdAt', meta.createdAt],
    ['projectKey', meta.projectKey],
    ['projectDir', meta.projectDir],
    ['projectPath', meta.projectPath],
  ];

  for (const [key, value] of metadataFromMeta) {
    const normalized = toNonEmptyString(value);
    if (normalized) metadata[key] = normalized;
  }

  let fenceLen = 0;
  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,})/);
    if (fenceMatch) {
      if (fenceLen === 0) fenceLen = fenceMatch[1].length;
      else if (fenceMatch[1].length >= fenceLen) fenceLen = 0;
      continue;
    }
    if (fenceLen > 0) continue;
    const matched = line.match(/^-\s+([^:]+):\s*(.+)$/);
    if (!matched) continue;
    const key = matched[1].trim();
    if (!(key in metadata)) metadata[key] = matched[2].trim();
  }

  const nextActionLine = lines.find((line) => line.trim().startsWith('- Next Action:'));
  const resumeHintLine = lines.find((line) => line.trim().startsWith('- Resume Hint'));
  const nextActionFromMeta = toNonEmptyString(meta.nextAction);
  const resumeHintFromMeta = toNonEmptyString(meta.resumeHint);
  const hasSpecLikeData =
    Boolean(raw) ||
    Object.keys(metadata).length > 0 ||
    Boolean(nextActionFromMeta) ||
    Boolean(resumeHintFromMeta);

  return {
    exists: hasSpecLikeData,
    path: specPath,
    metadata,
    nextAction:
      nextActionFromMeta ||
      (nextActionLine ? nextActionLine.split(':').slice(1).join(':').trim() : null),
    resumeHint:
      resumeHintFromMeta ||
      (resumeHintLine ? resumeHintLine.split(':').slice(1).join(':').trim() : null),
    preview: raw ? lines.slice(0, 80).join('\n') : undefined,
  };
}

function parseMetaSummary(taskId: string, specsDir: string): ZigrixTaskDetailData['meta'] {
  const metaPath = path.join(specsDir, `${taskId}.meta.json`);
  const data = readJson(metaPath, {});
  return {
    exists: fs.existsSync(metaPath),
    path: metaPath,
    data,
  };
}

// ─── Evidence ────────────────────────────────────────────────────────────────

function parseEvidenceSummary(
  taskId: string,
  evidenceDir: string,
): ZigrixTaskDetailData['evidence'] {
  const taskDir = path.join(evidenceDir, taskId);

  if (!fs.existsSync(taskDir)) {
    return { exists: false, path: taskDir, agents: [], merged: null };
  }

  const files = fs.readdirSync(taskDir).filter((f) => f.endsWith('.json'));
  const agents: ZigrixTaskDetailData['evidence']['agents'] = [];
  let merged: (LooseRecord & { path?: string }) | null = null;

  for (const file of files) {
    const fullPath = path.join(taskDir, file);
    const data = readJson(fullPath, {});

    if (file === '_merged.json') {
      merged = { ...data, path: fullPath };
      continue;
    }

    agents.push({
      file,
      path: fullPath,
      agentId: typeof data.agentId === 'string' ? data.agentId : file.replace(/\.json$/, ''),
      runId: typeof data.runId === 'string' ? data.runId : null,
      sessionKey: typeof data.sessionKey === 'string' ? data.sessionKey : null,
      sessionId: typeof data.sessionId === 'string' ? data.sessionId : null,
      ts: typeof data.ts === 'string' ? data.ts : null,
    });
  }

  return {
    exists: true,
    path: taskDir,
    agents: agents.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || ''))),
    merged,
  };
}

// ─── Session Resolution ───────────────────────────────────────────────────────

function getAgentFromSessionKey(sessionKey: string): string | null {
  const matched = sessionKey.match(/^agent:([^:]+):/);
  return matched?.[1] || null;
}

function parseAgentSubagentSessionKey(
  sessionKey: string,
): { agentId: string; sessionId: string } | null {
  const matched = sessionKey.match(/^agent:([^:]+):subagent:([^:\s]+)$/);
  if (!matched) return null;
  return { agentId: matched[1], sessionId: matched[2] };
}

function collectEventFieldCandidates(
  events: ZigrixEvent[],
  fieldNames: string[],
): string[] {
  const keys = new Set<string>();
  for (const event of events) {
    for (const fieldName of fieldNames) {
      const candidate = toNonEmptyString((event as LooseRecord)[fieldName]);
      if (candidate) keys.add(candidate);
    }
  }
  return Array.from(keys);
}

function parseTaskMetaSessionMap(
  taskId: string,
  specsDir: string,
): {
  sessionKeys: Set<string>;
  sessionToAgent: Map<string, string>;
  metaSessionIdMap: Map<string, string>;
} {
  const metaPath = path.join(specsDir, `${taskId}.meta.json`);
  const meta = readJson(metaPath, {});
  const sessionKeys = new Set<string>();
  const sessionToAgent = new Map<string, string>();
  const metaSessionIdMap = new Map<string, string>();

  const bindSession = (sessionKey: unknown, agentId?: string | null, sessionId?: string | null) => {
    const normalizedSessionKey = toNonEmptyString(sessionKey);
    if (!normalizedSessionKey) return;
    sessionKeys.add(normalizedSessionKey);
    const fromSession = getAgentFromSessionKey(normalizedSessionKey);
    const normalizedAgent = agentId || fromSession;
    if (normalizedAgent) sessionToAgent.set(normalizedSessionKey, normalizedAgent);
    if (sessionId) metaSessionIdMap.set(normalizedSessionKey, sessionId);
  };

  bindSession(meta.orchestratorSessionKey, 'pro-zig', toNonEmptyString(meta.orchestratorSessionId));

  if (isObject(meta.workerSessions)) {
    for (const [agentId, raw] of Object.entries(meta.workerSessions)) {
      if (!isObject(raw)) continue;
      bindSession(raw.sessionKey, agentId, toNonEmptyString(raw.sessionId));
    }
  }

  return { sessionKeys, sessionToAgent, metaSessionIdMap };
}

function collectEvidenceSessionMap(
  taskId: string,
  evidenceDir: string,
): { sessionKeys: Set<string>; sessionToAgent: Map<string, string> } {
  const taskDir = path.join(evidenceDir, taskId);
  const sessionKeys = new Set<string>();
  const sessionToAgent = new Map<string, string>();

  if (!fs.existsSync(taskDir)) return { sessionKeys, sessionToAgent };

  const files = fs.readdirSync(taskDir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    if (file === '_merged.json') continue;
    const fullPath = path.join(taskDir, file);
    const data = readJson(fullPath, {});
    const sessionKey = toNonEmptyString(data.sessionKey);
    const agentId = toNonEmptyString(data.agentId) || file.replace(/\.json$/, '');
    if (sessionKey) {
      sessionKeys.add(sessionKey);
      if (agentId) sessionToAgent.set(sessionKey, agentId);
    }
  }

  return { sessionKeys, sessionToAgent };
}

function resolveSessionIdMap(
  agentsStateDir: string,
  agentIds: string[],
  sessionKeys: string[],
): Map<string, string> {
  if (sessionKeys.length === 0) return new Map();
  const sessionKeySet = new Set(sessionKeys);
  const result = new Map<string, string>();

  for (const agentId of agentIds) {
    try {
      const sessionsJsonPath = path.join(agentsStateDir, agentId, 'sessions', 'sessions.json');
      const raw = fs.readFileSync(sessionsJsonPath, 'utf-8');
      const data = JSON.parse(raw) as unknown;
      if (!isObject(data)) continue;
      for (const [sessionKey, entry] of Object.entries(data)) {
        if (!sessionKeySet.has(sessionKey)) continue;
        if (!isObject(entry)) continue;
        const sessionId = toNonEmptyString((entry as LooseRecord).sessionId);
        if (sessionId) result.set(sessionKey, sessionId);
      }
    } catch {
      // skip
    }
  }

  // Fallback: for unresolved session keys, check deleted session files
  // Deleted files follow the pattern: <sessionId>.jsonl.deleted.*
  const unresolvedKeys = sessionKeys.filter((sk) => !result.has(sk));
  if (unresolvedKeys.length > 0) {
    for (const sessionKey of unresolvedKeys) {
      const parsed = parseAgentSubagentSessionKey(sessionKey);
      if (!parsed) continue;
      // The sessionId from the key itself is a valid candidate
      const candidateSessionId = parsed.sessionId;
      const sessionsDir = path.join(agentsStateDir, parsed.agentId, 'sessions');
      try {
        if (!fs.existsSync(sessionsDir)) continue;
        const prefix = `${candidateSessionId}.jsonl`;
        // Check for active file or any deleted variant
        const hasFile = fs.existsSync(path.join(sessionsDir, prefix)) ||
          fs.readdirSync(sessionsDir).some((name) => name.startsWith(`${prefix}.deleted.`));
        if (hasFile) {
          result.set(sessionKey, candidateSessionId);
        }
      } catch {
        // skip
      }
    }
  }

  return result;
}

function resolveTaskSessionKeys(
  taskId: string,
  events: ZigrixEvent[],
  specsDir: string,
  evidenceDir: string,
  agentsStateDir: string,
  agentIds: string[],
): {
  sessionKeys: string[];
  sessionToAgent: Map<string, string>;
  sessionIdMap: Map<string, string>;
} {
  const taskEvents = events.filter((e) => e.taskId === taskId);
  const metaSessions = parseTaskMetaSessionMap(taskId, specsDir);
  const evidenceSessions = collectEvidenceSessionMap(taskId, evidenceDir);
  const merged = new Set<string>([
    ...Array.from(metaSessions.sessionKeys),
    ...Array.from(evidenceSessions.sessionKeys),
  ]);
  const sessionToAgent = new Map<string, string>([
    ...Array.from(metaSessions.sessionToAgent.entries()),
    ...Array.from(evidenceSessions.sessionToAgent.entries()),
  ]);

  const bindSession = (sessionKey: string, agentId?: string | null) => {
    merged.add(sessionKey);
    const fromSession = getAgentFromSessionKey(sessionKey);
    const normalizedAgent = agentId || fromSession;
    if (normalizedAgent) sessionToAgent.set(sessionKey, normalizedAgent);
  };

  const fromEventSessionFields = collectEventFieldCandidates(taskEvents, [
    'sessionKey',
    'session_key',
    'parentSessionKey',
    'parent_session_key',
  ]);
  for (const sk of fromEventSessionFields) bindSession(sk);

  const workerEvents = taskEvents.filter((e) =>
    ['worker_dispatched', 'worker_done'].includes(String(e.event || e.action || '')),
  );
  for (const event of workerEvents) {
    const agentId =
      toNonEmptyString(event.targetAgent) ||
      toNonEmptyString(event.agentId) ||
      toNonEmptyString(event.actor);
    const sk =
      toNonEmptyString(event.sessionKey) ||
      toNonEmptyString(event.session_key) ||
      toNonEmptyString((event as LooseRecord).childSessionKey);
    if (sk) bindSession(sk, agentId);
  }

  const sessionIdMap = resolveSessionIdMap(agentsStateDir, agentIds, Array.from(merged));
  metaSessions.metaSessionIdMap.forEach((sid, sk) => {
    if (!sessionIdMap.has(sk)) sessionIdMap.set(sk, sid);
  });

  return { sessionKeys: Array.from(merged), sessionToAgent, sessionIdMap };
}

function findSessionFile(
  agentsStateDir: string,
  agentId: string,
  sessionId: string,
): { filePath: string; source: 'active' | 'deleted' } | null {
  const sessionsDir = path.join(agentsStateDir, agentId, 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;

  const activePath = path.join(sessionsDir, `${sessionId}.jsonl`);
  if (fs.existsSync(activePath)) return { filePath: activePath, source: 'active' };

  const prefix = `${sessionId}.jsonl.deleted.`;
  const matched = fs
    .readdirSync(sessionsDir)
    .filter((name) => name.startsWith(prefix))
    .sort((a, b) => b.localeCompare(a));

  if (matched.length === 0) return null;
  return { filePath: path.join(sessionsDir, matched[0]), source: 'deleted' };
}

function readJsonlMessages(filePath: string): LooseRecord[] {
  const raw = safeReadText(filePath);
  if (!raw.trim()) return [];

  const messages: LooseRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!isObject(parsed)) continue;
      if (parsed.type !== 'message') continue;
      const inner = isObject(parsed.message) ? (parsed.message as LooseRecord) : parsed;
      messages.push({
        id: toNonEmptyString(parsed.id),
        parentId: toNonEmptyString(parsed.parentId),
        role: toNonEmptyString(inner.role),
        content: inner.content,
        timestamp: toTimestampMs(parsed) ?? toNonEmptyString(parsed.ts),
      });
    } catch {
      // skip
    }
  }
  return messages;
}

function toTimestampMs(rawMessage: LooseRecord): number | null {
  const ts = rawMessage.timestamp;
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const asNumber = Number(ts);
    if (Number.isFinite(asNumber)) return asNumber;
    const asDate = Date.parse(ts);
    if (Number.isFinite(asDate)) return asDate;
  }
  const tsRaw = rawMessage.ts;
  if (typeof tsRaw === 'string') {
    const asDate = Date.parse(tsRaw);
    if (Number.isFinite(asDate)) return asDate;
  }
  return null;
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const row = item as LooseRecord;
      if (typeof row.text === 'string') return row.text;
      if (typeof row.thinking === 'string') return row.thinking;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function isDuplicateWorkerCompletionAnnounce(sessionKey: string, message: LooseRecord): boolean {
  if (getAgentFromSessionKey(sessionKey) !== 'pro-zig') return false;
  const role = toNonEmptyString(message.role);
  const text = extractMessageText(message.content).trim();
  if (!text) return false;
  if (role === 'assistant' && text === 'NO_REPLY') return true;
  if (role !== 'user') return false;
  const normalized = text.toLowerCase();
  return normalized.includes('internal task completion event') && normalized.includes('source: subagent');
}

function flattenConversationStream(
  sessionRows: Array<{ sessionKey: string; messages: LooseRecord[] }>,
  sessionToAgent: Map<string, string>,
): ZigrixConversationStreamMessage[] {
  const flattened = sessionRows.flatMap(({ sessionKey, messages }, sessionIdx) =>
    messages
      .filter((message) => !isDuplicateWorkerCompletionAnnounce(sessionKey, message))
      .map((message, idx) => {
        const timestamp = toTimestampMs(message);
        const ts = timestamp ? new Date(timestamp).toISOString() : toNonEmptyString(message.ts);
        const agentId =
          sessionToAgent.get(sessionKey) || getAgentFromSessionKey(sessionKey) || 'unknown';
        return {
          __sortTs: timestamp ?? Number.MAX_SAFE_INTEGER,
          __sessionIdx: sessionIdx,
          __sortIdx: idx,
          row: {
            sessionKey,
            agentId,
            agentName: agentId,
            role: toNonEmptyString(message.role),
            timestamp,
            ts,
            toolName: toNonEmptyString(message.toolName),
            toolCallId: toNonEmptyString(message.toolCallId),
            isError: Boolean(message.isError),
            content: message.content,
            raw: message,
          } satisfies ZigrixConversationStreamMessage,
        };
      }),
  );

  return flattened
    .sort((a, b) => {
      const tsDiff = a.__sortTs - b.__sortTs;
      if (tsDiff !== 0) return tsDiff;
      const sessionDiff = a.__sessionIdx - b.__sessionIdx;
      if (sessionDiff !== 0) return sessionDiff;
      return a.__sortIdx - b.__sortIdx;
    })
    .map((item) => item.row);
}

function buildTaskRecentEvents(
  taskId: string,
  events: ZigrixEvent[],
): ZigrixConversationEventRow[] {
  return sortByTsDesc(events)
    .filter((e) => e.taskId === taskId)
    .slice(0, 50)
    .map((e) => ({
      ts: e.ts || null,
      event: e.event || e.action || null,
      status: e.status || null,
      actor: e.actor || e.agentId || null,
      targetAgent: toNonEmptyString(e.targetAgent) || toNonEmptyString(e.agentId),
      runId: toNonEmptyString(e.runId),
      sessionKey: toNonEmptyString(e.sessionKey),
    }));
}

// ─── Gateway Invoker ─────────────────────────────────────────────────────────

function buildGatewayInvoker(options?: {
  gatewayUrl?: string;
  gatewayToken?: string;
  fetchImpl?: typeof fetch;
}): ToolInvoker {
  const url =
    options?.gatewayUrl ||
    process.env.OPENCLAW_GATEWAY_URL ||
    DEFAULT_GATEWAY_URL;
  const token = options?.gatewayToken || process.env.OPENCLAW_GATEWAY_TOKEN || null;
  const fetchImpl = options?.fetchImpl || fetch;
  const endpoint = `${url.replace(/\/+$/, '')}/tools/invoke`;

  return async (tool: string, args: LooseRecord) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tool, args }),
    });

    const bodyText = await response.text();
    let parsed: unknown = null;
    if (bodyText.trim()) {
      try {
        parsed = JSON.parse(bodyText) as unknown;
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const message =
        isObject(parsed) &&
        isObject(parsed.error) &&
        typeof parsed.error.message === 'string'
          ? parsed.error.message
          : bodyText.slice(0, 500) || `HTTP ${response.status}`;
      throw new Error(`gateway_invoke_failed(${response.status}): ${message}`);
    }

    if (!isObject(parsed) || parsed.ok !== true) {
      throw new Error('gateway_invoke_failed: invalid_response');
    }

    return parsed.result;
  };
}

// ─── createStoreError ─────────────────────────────────────────────────────────

function createStoreError(code: string, message: string): Error & { code?: string } {
  const err = new Error(message) as Error & { code?: string };
  err.code = code;
  return err;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createZigrixStore(options?: {
  zigrixHome?: string;
  agentsStateDir?: string;
  subagentRunsPath?: string;
  openclawConfigPath?: string;
  gatewayUrl?: string;
  gatewayToken?: string;
  sessionsHistoryLimit?: number;
  invokeTool?: ToolInvoker;
  fetchImpl?: typeof fetch;
}) {
  const zigrixHome = options?.zigrixHome || getZigrixHome();

  // Read openclaw integration config from zigrix config (set during onboard)
  const zigrixOcConfig = readZigrixOpenClawConfig(zigrixHome);
  const resolvedOpenClawHome = zigrixOcConfig?.home || process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  const resolvedAgentsDir = options?.agentsStateDir || process.env.OPENCLAW_AGENTS_DIR || path.join(resolvedOpenClawHome, 'agents');

  const paths = {
    zigrixHome,
    indexPath: path.join(zigrixHome, 'index.json'),
    eventsPath: path.join(zigrixHome, 'tasks.jsonl'),
    specsDir: path.join(zigrixHome, 'tasks'),
    evidenceDir: path.join(zigrixHome, 'evidence'),
    agentsStateDir: resolvedAgentsDir,
    subagentRunsPath:
      options?.subagentRunsPath || process.env.OPENCLAW_SUBAGENT_RUNS_PATH || DEFAULT_SUBAGENT_RUNS_PATH,
    openclawConfigPath:
      options?.openclawConfigPath || process.env.OPENCLAW_CONFIG_PATH || path.join(resolvedOpenClawHome, 'openclaw.json'),
    openclawBinPath: zigrixOcConfig?.binPath || null,
  };

  // Use gateway URL from zigrix config (set during onboard) as fallback
  const resolvedGatewayUrl = options?.gatewayUrl || process.env.OPENCLAW_GATEWAY_URL || zigrixOcConfig?.gatewayUrl || DEFAULT_GATEWAY_URL;

  const invokeTool =
    options?.invokeTool ||
    buildGatewayInvoker({
      gatewayUrl: resolvedGatewayUrl,
      gatewayToken: options?.gatewayToken,
      fetchImpl: options?.fetchImpl,
    });

  const sessionsHistoryLimit = toPositiveInteger(
    options?.sessionsHistoryLimit ?? process.env.SESSIONS_HISTORY_LIMIT,
    DEFAULT_SESSIONS_HISTORY_LIMIT,
  );

  // Dynamically read agent IDs from config
  function getAgentIds(): string[] {
    return readAgentIds(zigrixHome);
  }

  function loadOverview(): ZigrixOverviewData {
    const index = normalizeIndex(readJson(paths.indexPath, {}));
    const events = readJsonl(paths.eventsPath);
    const agentIds = getAgentIds();

    const bucketCounts = Object.fromEntries(
      Object.entries(index.statusBuckets).map(([status, rows]) => [
        status,
        Array.isArray(rows) ? rows.length : 0,
      ]),
    );

    const activeTasks = Object.entries(index.activeTasks).map(([taskId, taskRaw]) => {
      const task = isObject(taskRaw) ? taskRaw : {};
      const snapshot = buildTaskSnapshot(taskId, events, paths.specsDir);
      return {
        taskId,
        status: typeof task.status === 'string' ? task.status : snapshot.status,
        updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : snapshot.updatedAt,
        scale: snapshot.scale,
        title: snapshot.title,
      };
    });

    const recentEvents = sortByTsDesc(events)
      .slice(0, 30)
      .map((e) => ({
        ts: e.ts,
        event: e.event || e.action,
        taskId: e.taskId,
        status: e.status,
        actor: e.actor || e.agentId,
        agentId: e.agentId,
        targetAgent: e.targetAgent || e.agentId,
        title: e.title,
      }));

    const taskHistory = buildTaskHistory(events, paths.specsDir);

    // Suppress unused variable warning
    void agentIds;

    return {
      generatedAt: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development'
        ? {
            source: {
              indexPath: paths.indexPath,
              eventsPath: paths.eventsPath,
              specsDir: paths.specsDir,
              evidenceDir: paths.evidenceDir,
              agentsStateDir: paths.agentsStateDir,
              subagentRunsPath: paths.subagentRunsPath,
              openclawConfigPath: paths.openclawConfigPath,
            },
          }
        : {}),
      updatedAt: index.updatedAt,
      bucketCounts,
      statusBuckets: index.statusBuckets,
      activeTasks: activeTasks.sort((a, b) =>
        String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
      ),
      recentEvents,
      taskHistory,
      openclawAvailable: true,
    };
  }

  function loadTaskDetail(taskId: string): ZigrixTaskDetailData {
    const events = readJsonl(paths.eventsPath);
    const snapshot = buildTaskSnapshot(taskId, events, paths.specsDir);
    const spec = parseSpecSummary(taskId, paths.specsDir);
    const meta = parseMetaSummary(taskId, paths.specsDir);
    const evidence = parseEvidenceSummary(taskId, paths.evidenceDir);

    return {
      generatedAt: new Date().toISOString(),
      task: snapshot,
      spec,
      meta,
      evidence,
    };
  }

  async function loadTaskConversation(taskId: string): Promise<ZigrixTaskConversationData> {
    const events = readJsonl(paths.eventsPath);
    const agentIds = getAgentIds();
    const sessionMeta = resolveTaskSessionKeys(
      taskId,
      events,
      paths.specsDir,
      paths.evidenceDir,
      paths.agentsStateDir,
      agentIds,
    );
    const sessionKeys = sessionMeta.sessionKeys;
    const recentEvents = buildTaskRecentEvents(taskId, events);

    let openclawAvailable = true;

    const sessionFetchResults = await Promise.all(
      sessionKeys.map(async (sessionKey) => {
        let activeError: string | null = null;

        // Try gateway first
        try {
          const result = await invokeTool('sessions_history', {
            sessionKey,
            limit: sessionsHistoryLimit,
            includeTools: true,
          });

          const resultObj = isObject(result) ? result : {};
          const detailsObj = isObject(resultObj.details)
            ? (resultObj.details as LooseRecord)
            : {};
          const rows = Array.isArray(detailsObj.messages)
            ? detailsObj.messages
            : Array.isArray(resultObj.messages)
            ? resultObj.messages
            : [];
          const messages = rows.filter((row): row is LooseRecord => isObject(row));

          if (messages.length > 0 || !parseAgentSubagentSessionKey(sessionKey)) {
            return {
              sessionKey,
              ok: true,
              messageCount: messages.length,
              error: null,
              messages,
            };
          }
        } catch (error) {
          activeError = String((error as Error)?.message || error);
          openclawAvailable = false;
        }

        // Fallback: read session file directly
        try {
          const parsed = parseAgentSubagentSessionKey(sessionKey);
          if (!parsed) {
            return {
              sessionKey,
              ok: activeError ? false : true,
              messageCount: 0,
              error: activeError,
              messages: [] as LooseRecord[],
            };
          }

          const resolvedSessionId = sessionMeta.sessionIdMap.get(sessionKey) ?? parsed.sessionId;
          let matched = findSessionFile(paths.agentsStateDir, parsed.agentId, resolvedSessionId);

          if (!matched && resolvedSessionId !== parsed.sessionId) {
            matched = findSessionFile(paths.agentsStateDir, parsed.agentId, parsed.sessionId);
          }

          if (!matched) {
            return {
              sessionKey,
              ok: activeError ? false : true,
              messageCount: 0,
              error: activeError,
              messages: [] as LooseRecord[],
            };
          }

          const messages = readJsonlMessages(matched.filePath);
          openclawAvailable = true; // file fallback succeeded
          return {
            sessionKey,
            ok: true,
            messageCount: messages.length,
            error: null,
            messages,
          };
        } catch (error) {
          return {
            sessionKey,
            ok: false,
            messageCount: 0,
            error: activeError || String((error as Error)?.message || error),
            messages: [] as LooseRecord[],
          };
        }
      }),
    );

    const stream = flattenConversationStream(sessionFetchResults, sessionMeta.sessionToAgent);
    const sessions: ZigrixSessionHistoryFetchMeta[] = sessionFetchResults.map((item) => ({
      sessionKey: item.sessionKey,
      ok: item.ok,
      messageCount: item.messageCount,
      error: item.error,
    }));

    return {
      generatedAt: new Date().toISOString(),
      taskId,
      sessionKeys,
      stream,
      recentEvents,
      sessions,
      openclawAvailable,
    };
  }

  async function cancelTask(taskId: string): Promise<{ ok: boolean; killedSessions: string[] }> {
    const events = readJsonl(paths.eventsPath);
    const taskEvents = events.filter((e) => String(e.taskId || '') === taskId);
    const currentStatus = inferTaskStatus(taskEvents);

    if (currentStatus !== 'IN_PROGRESS' && currentStatus !== 'OPEN') {
      throw createStoreError(
        'task_not_cancellable',
        `task_not_cancellable(taskId=${taskId}, status=${String(currentStatus || 'unknown')})`,
      );
    }

    const agentIds = getAgentIds();
    const { sessionKeys } = resolveTaskSessionKeys(
      taskId,
      events,
      paths.specsDir,
      paths.evidenceDir,
      paths.agentsStateDir,
      agentIds,
    );
    const killedSessions: string[] = [];

    for (const sk of sessionKeys) {
      try {
        await invokeTool('subagents', { action: 'kill', target: sk });
      } catch {
        // best-effort
      }
      killedSessions.push(sk);
    }

    const blockedEvent = {
      ts: new Date().toISOString(),
      event: 'blocked',
      taskId,
      phase: 'execution',
      status: 'BLOCKED',
      actor: 'manual',
      payload: { reason: 'user_cancelled', killedSessions },
    };
    fs.appendFileSync(paths.eventsPath, JSON.stringify(blockedEvent) + '\n', 'utf-8');

    // Update meta.json status to BLOCKED
    const metaFilePath = path.join(paths.specsDir, `${taskId}.meta.json`);
    const meta = readJson(metaFilePath, {});
    if (Object.keys(meta).length > 0) {
      meta.status = 'BLOCKED';
      meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(metaFilePath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
    }

    return { ok: true, killedSessions };
  }

  function getTaskSessionFilePaths(taskId: string): string[] {
    const events = readJsonl(paths.eventsPath);
    const agentIds = getAgentIds();
    const { sessionKeys, sessionIdMap } = resolveTaskSessionKeys(
      taskId,
      events,
      paths.specsDir,
      paths.evidenceDir,
      paths.agentsStateDir,
      agentIds,
    );

    return sessionKeys
      .map((sessionKey) => {
        const parsed = parseAgentSubagentSessionKey(sessionKey);
        if (!parsed) return null;
        const resolvedSessionId = sessionIdMap.get(sessionKey) ?? parsed.sessionId;
        return path.join(
          paths.agentsStateDir,
          parsed.agentId,
          'sessions',
          `${resolvedSessionId}.jsonl`,
        );
      })
      .filter((p): p is string => p !== null);
  }

  return {
    paths,
    loadOverview,
    loadTaskDetail,
    loadTaskConversation,
    cancelTask,
    getTaskSessionFilePaths,
  };
}
