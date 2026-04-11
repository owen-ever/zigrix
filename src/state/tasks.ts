import fs from 'node:fs';
import path from 'node:path';

import { appendEvent, loadEvents, nowIso } from './events.js';
import { type ZigrixPaths, ensureBaseState } from './paths.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type WorkPackage = {
  id: string;
  key: string;
  title: string;
  parallel: boolean;
};

export type ExecutionUnit = {
  id: string;
  title: string;
  kind: string;
  owner: string;
  workPackage: string;
  dependsOn: string[];
  parallel: boolean;
  status: string;
  dod: string;
};

export type ZigrixTask = {
  taskId: string;
  title: string;
  description: string;
  scale: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  requiredAgents: string[];
  workerSessions: Record<string, unknown>;
  projectDir?: string;
  requestedBy?: string;
  selectedAgents?: string[];
  workPackages?: WorkPackage[];
  executionUnits?: ExecutionUnit[];
  baselineRequiredAgents?: string[];
  candidateAgents?: string[];
  requiredRoles?: string[];
  optionalRoles?: string[];
  roleAgentMap?: Record<string, string[]>;
  orchestratorId?: string;
  qaAgentId?: string;
  orchestratorSessionKey?: string;
  orchestratorSessionId?: string;
  nextAction?: string;
  resumeHint?: string;
  staleReason?: string;
  staleReasons?: string[];
};

export type StaleReasonCode = 'stale_timeout' | 'session_dead' | 'missing_session_mapping';

export type SessionDiagnosis = {
  scope: 'orchestrator' | 'worker';
  agentId: string;
  sessionKey: string;
  sessionId: string | null;
  mappingSource: 'explicit' | 'parsed' | 'sessions_json' | 'none';
  state: 'active' | 'deleted' | 'missing';
  reason: 'session_dead' | 'missing_session_mapping' | null;
  activePath: string | null;
  deletedPath: string | null;
};

export type StaleTaskSummary = {
  taskId: string;
  title: string;
  updatedAt: string;
  hoursThreshold: number;
  timedOut: boolean;
  reason: string;
  reasonCode: StaleReasonCode;
  reasons: StaleReasonCode[];
  nextAction: string;
  resumeHint: string;
  reportLine: string;
  sessions: SessionDiagnosis[];
};

// ─── Paths ──────────────────────────────────────────────────────────────────

const TASK_ID_RE = /^(DEV|TEST|TASK)-(\d{8})-(\d{3})$/;

function metaPath(paths: ZigrixPaths, taskId: string): string {
  return path.join(paths.tasksDir, `${taskId}.meta.json`);
}

function specPath(paths: ZigrixPaths, taskId: string): string {
  return path.join(paths.tasksDir, `${taskId}.md`);
}

/** Legacy flat JSON path (backward compat read) */
function legacyPath(paths: ZigrixPaths, taskId: string): string {
  return path.join(paths.tasksDir, `${taskId}.json`);
}

export function resolveTaskPaths(paths: ZigrixPaths, taskId: string): {
  specPath: string;
  metaPath: string;
  legacyPath: string;
} {
  return {
    specPath: specPath(paths, taskId),
    metaPath: metaPath(paths, taskId),
    legacyPath: legacyPath(paths, taskId),
  };
}

// ─── Read helpers ───────────────────────────────────────────────────────────

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Task ID generation ─────────────────────────────────────────────────────

export function nextTaskId(paths: ZigrixPaths, prefix = 'DEV'): string {
  ensureBaseState(paths);
  const today = nowIso().slice(0, 10).replaceAll('-', '');
  const idPrefix = `${prefix}-${today}-`;
  let maxN = 0;
  for (const name of fs.readdirSync(paths.tasksDir)) {
    const base = name.replace(/\.(meta\.json|json|md)$/, '');
    const match = TASK_ID_RE.exec(base);
    if (match && base.startsWith(idPrefix)) {
      maxN = Math.max(maxN, Number(match[3]));
    }
  }
  return `${idPrefix}${String(maxN + 1).padStart(3, '0')}`;
}

// ─── Spec template ──────────────────────────────────────────────────────────

function renderSpecMd(task: ZigrixTask): string {
  return [
    '# Task Spec',
    '',
    '## 0) Task Metadata',
    `- Task ID: \`${task.taskId}\``,
    `- Title: ${task.title}`,
    `- Scale: \`${task.scale}\``,
    `- Status: \`${task.status}\``,
    `- Created: ${task.createdAt}`,
    task.requestedBy ? `- Requested by: ${task.requestedBy}` : null,
    task.projectDir ? `- Project dir: ${task.projectDir}` : null,
    `- Meta: \`${task.taskId}.meta.json\``,
    '',
    '## Spec Rule',
    '- `normal|risky|large`: 이 문서 작성/갱신 완료 전 작업 진행 금지',
    '- `simple`: 요약형 허용, 문서 파일은 반드시 생성',
    '- 사람용 문서. 기계용 정보는 `.meta.json` 우선.',
    '',
    '## 1) Scope',
    '### In-Scope',
    task.description,
    '',
    '### Out-of-Scope',
    '- (TBD)',
    '',
    '## 2) Orchestration Plan',
    `- Required agents: ${task.requiredAgents.join(', ') || '(none)'}`,
    task.selectedAgents?.length ? `- Selected agents: ${task.selectedAgents.join(', ')}` : null,
    '',
    '## 3) Notes',
    '- (TBD)',
    '',
  ].filter((line) => line !== null).join('\n');
}

// ─── Save / Load ────────────────────────────────────────────────────────────

export function saveTask(paths: ZigrixPaths, task: ZigrixTask): ZigrixTask {
  ensureBaseState(paths);
  task.updatedAt = nowIso();

  // Write meta.json (machine data)
  fs.writeFileSync(metaPath(paths, task.taskId), `${JSON.stringify(task, null, 2)}\n`, 'utf8');

  // Write .md spec if it doesn't exist yet (don't overwrite human edits)
  const mdPath = specPath(paths, task.taskId);
  if (!fs.existsSync(mdPath)) {
    fs.writeFileSync(mdPath, renderSpecMd(task), 'utf8');
  }

  rebuildIndex(paths);
  return task;
}

export function loadTask(paths: ZigrixPaths, taskId: string): ZigrixTask | null {
  // Prefer .meta.json, fall back to legacy .json
  const meta = readJson(metaPath(paths, taskId));
  if (meta) return meta as ZigrixTask;
  const legacy = readJson(legacyPath(paths, taskId));
  return legacy as ZigrixTask | null;
}

export function listTasks(paths: ZigrixPaths): ZigrixTask[] {
  ensureBaseState(paths);
  const seen = new Set<string>();
  const tasks: ZigrixTask[] = [];

  for (const name of fs.readdirSync(paths.tasksDir).sort()) {
    let taskId: string | null = null;

    if (name.endsWith('.meta.json')) {
      taskId = name.replace(/\.meta\.json$/, '');
    } else if (name.endsWith('.json') && !name.endsWith('.meta.json')) {
      taskId = name.replace(/\.json$/, '');
    }

    if (!taskId || seen.has(taskId)) continue;
    if (!TASK_ID_RE.test(taskId)) continue;

    const data = loadTask(paths, taskId);
    if (data) {
      seen.add(taskId);
      tasks.push(data);
    }
  }

  return tasks;
}

// ─── Events ─────────────────────────────────────────────────────────────────

export function listTaskEvents(paths: ZigrixPaths, taskId?: string): Array<Record<string, unknown>> {
  const rows = loadEvents(paths.eventsFile);
  return taskId ? rows.filter((row) => String(row.taskId ?? '') === taskId) : rows;
}

// ─── Create ─────────────────────────────────────────────────────────────────

export function createTask(paths: ZigrixPaths, params: {
  title: string;
  description: string;
  scale?: string;
  requiredAgents?: string[];
  projectDir?: string;
  requestedBy?: string;
  prefix?: string;
}): ZigrixTask {
  const task: ZigrixTask = {
    taskId: nextTaskId(paths, params.prefix ?? 'DEV'),
    title: params.title,
    description: params.description,
    scale: params.scale ?? 'normal',
    status: 'OPEN',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    requiredAgents: [...(params.requiredAgents ?? [])],
    workerSessions: {},
    ...(params.projectDir ? { projectDir: params.projectDir } : {}),
    ...(params.requestedBy ? { requestedBy: params.requestedBy } : {}),
  };
  saveTask(paths, task);
  appendEvent(paths.eventsFile, {
    event: 'task_created',
    taskId: task.taskId,
    status: 'OPEN',
    title: task.title,
    scale: task.scale,
    payload: { requiredAgents: task.requiredAgents, projectDir: params.projectDir ?? null },
  });
  rebuildIndex(paths);
  return task;
}

// ─── Status transitions ─────────────────────────────────────────────────────

export function updateTaskStatus(paths: ZigrixPaths, taskId: string, status: string): ZigrixTask | null {
  const task = loadTask(paths, taskId);
  if (!task) return null;
  task.status = status;
  saveTask(paths, task);
  appendEvent(paths.eventsFile, { event: 'task_status_changed', taskId, status });
  rebuildIndex(paths);
  return task;
}

export function bindOrchestratorSession(paths: ZigrixPaths, params: {
  taskId: string;
  agentId: string;
  sessionKey: string;
  sessionId?: string;
}): Record<string, unknown> | null {
  const task = loadTask(paths, params.taskId);
  if (!task) return null;

  const parsed = parseAgentSubagentSessionKey(params.sessionKey);
  if (parsed && parsed.agentId !== params.agentId) {
    throw new Error(
      `orchestrator bind validation failed: sessionKey belongs to '${parsed.agentId}', expected '${params.agentId}'`,
    );
  }

  const resolvedSessionId = params.sessionId ?? parsed?.sessionId ?? null;
  task.orchestratorId = params.agentId;
  task.orchestratorSessionKey = params.sessionKey;
  if (resolvedSessionId) {
    task.orchestratorSessionId = resolvedSessionId;
  } else {
    delete task.orchestratorSessionId;
  }
  saveTask(paths, task);
  appendEvent(paths.eventsFile, {
    event: 'orchestrator_bound',
    taskId: params.taskId,
    phase: 'dispatch',
    actor: 'zigrix',
    targetAgent: params.agentId,
    status: task.status,
    sessionKey: params.sessionKey,
    sessionId: resolvedSessionId,
    payload: { agentId: params.agentId },
  });
  rebuildIndex(paths);
  return {
    ok: true,
    taskId: params.taskId,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    sessionId: resolvedSessionId,
    status: task.status,
  };
}

export function recordTaskProgress(paths: ZigrixPaths, params: {
  taskId: string;
  actor: string;
  message: string;
  unitId?: string;
  workPackage?: string;
}): Record<string, unknown> | null {
  const task = loadTask(paths, params.taskId);
  if (!task) return null;
  saveTask(paths, task);
  const event = appendEvent(paths.eventsFile, {
    event: 'progress_report',
    taskId: params.taskId,
    phase: 'execution',
    actor: params.actor,
    payload: {
      message: params.message,
      unitId: params.unitId,
      workPackage: params.workPackage,
    },
  });
  rebuildIndex(paths);
  return event;
}

// ─── Stale policy ───────────────────────────────────────────────────────────

type StalePolicyOptions = {
  agentsStateDir?: string | null;
  fallbackReason?: string;
};

type TaskSessionRef = {
  scope: 'orchestrator' | 'worker';
  agentId: string;
  sessionKey: string;
  sessionId: string | null;
};

function toNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseAgentSubagentSessionKey(sessionKey: string): { agentId: string; sessionId: string } | null {
  const matched = sessionKey.match(/^agent:([^:]+):subagent:([^:\s]+)$/);
  if (!matched) return null;
  return { agentId: matched[1], sessionId: matched[2] };
}

function resolveSessionIdFromSessionsJson(agentsStateDir: string, agentId: string, sessionKey: string): string | null {
  try {
    const sessionsJsonPath = path.join(agentsStateDir, agentId, 'sessions', 'sessions.json');
    const raw = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf8')) as Record<string, unknown>;
    const entry = raw[sessionKey];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    return toNonEmptyString((entry as Record<string, unknown>).sessionId);
  } catch {
    return null;
  }
}

function listDeletedSessionPaths(agentsStateDir: string, agentId: string, sessionId: string): string[] {
  const sessionsDir = path.join(agentsStateDir, agentId, 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];
  const prefix = `${sessionId}.jsonl.deleted.`;
  try {
    return fs.readdirSync(sessionsDir)
      .filter((name) => name.startsWith(prefix))
      .sort((a, b) => b.localeCompare(a))
      .map((name) => path.join(sessionsDir, name));
  } catch {
    return [];
  }
}

function collectTaskSessionRefs(task: ZigrixTask): TaskSessionRef[] {
  const refs: TaskSessionRef[] = [];

  if (task.orchestratorSessionKey && task.orchestratorId) {
    refs.push({
      scope: 'orchestrator',
      agentId: task.orchestratorId,
      sessionKey: task.orchestratorSessionKey,
      sessionId: task.orchestratorSessionId ?? null,
    });
  }

  for (const [agentId, raw] of Object.entries(task.workerSessions ?? {})) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const data = raw as Record<string, unknown>;
    const sessionKey = toNonEmptyString(data.sessionKey);
    if (!sessionKey) continue;
    refs.push({
      scope: 'worker',
      agentId,
      sessionKey,
      sessionId: toNonEmptyString(data.sessionId),
    });
  }

  return refs;
}

function diagnoseTaskSessions(task: ZigrixTask, agentsStateDir?: string | null): SessionDiagnosis[] {
  if (!agentsStateDir) return [];

  return collectTaskSessionRefs(task).map((ref) => {
    const parsed = parseAgentSubagentSessionKey(ref.sessionKey);
    const agentId = parsed?.agentId ?? ref.agentId;

    let resolvedSessionId = ref.sessionId;
    let mappingSource: SessionDiagnosis['mappingSource'] = ref.sessionId ? 'explicit' : 'none';

    if (!resolvedSessionId && parsed) {
      resolvedSessionId = parsed.sessionId;
      mappingSource = 'parsed';
    }

    if (!resolvedSessionId) {
      const mappedSessionId = resolveSessionIdFromSessionsJson(agentsStateDir, agentId, ref.sessionKey);
      if (mappedSessionId) {
        resolvedSessionId = mappedSessionId;
        mappingSource = 'sessions_json';
      }
    }

    if (!resolvedSessionId) {
      return {
        scope: ref.scope,
        agentId,
        sessionKey: ref.sessionKey,
        sessionId: null,
        mappingSource,
        state: 'missing',
        reason: 'missing_session_mapping',
        activePath: null,
        deletedPath: null,
      };
    }

    const activePath = path.join(agentsStateDir, agentId, 'sessions', `${resolvedSessionId}.jsonl`);
    if (fs.existsSync(activePath)) {
      return {
        scope: ref.scope,
        agentId,
        sessionKey: ref.sessionKey,
        sessionId: resolvedSessionId,
        mappingSource,
        state: 'active',
        reason: null,
        activePath,
        deletedPath: null,
      };
    }

    const deletedPaths = listDeletedSessionPaths(agentsStateDir, agentId, resolvedSessionId);
    if (deletedPaths.length > 0) {
      return {
        scope: ref.scope,
        agentId,
        sessionKey: ref.sessionKey,
        sessionId: resolvedSessionId,
        mappingSource,
        state: 'deleted',
        reason: 'session_dead',
        activePath: null,
        deletedPath: deletedPaths[0],
      };
    }

    return {
      scope: ref.scope,
      agentId,
      sessionKey: ref.sessionKey,
      sessionId: resolvedSessionId,
      mappingSource,
      state: 'missing',
      reason: null,
      activePath: null,
      deletedPath: null,
    };
  });
}

function joinUniqueAgentIds(diagnoses: SessionDiagnosis[], reason: SessionDiagnosis['reason']): string {
  const agentIds = Array.from(new Set(diagnoses.filter((item) => item.reason === reason).map((item) => item.agentId)));
  return agentIds.join(', ') || 'unknown-agent';
}

function buildStaleGuidance(task: ZigrixTask, reasonCode: StaleReasonCode, hours: number, diagnoses: SessionDiagnosis[]): {
  reason: string;
  nextAction: string;
  resumeHint: string;
  reportLine: string;
} {
  if (reasonCode === 'session_dead') {
    const agents = joinUniqueAgentIds(diagnoses, 'session_dead');
    return {
      reason: 'session_dead',
      nextAction: `respawn the deleted OpenClaw session for ${agents} and re-register it before resuming ${task.taskId}`,
      resumeHint: `start a fresh session for ${agents}, then update zigrix with the new session key/sessionId before continuing the blocked task`,
      reportLine: `${task.taskId}: BLOCKED session_dead (${agents})`,
    };
  }

  if (reasonCode === 'missing_session_mapping') {
    const agents = joinUniqueAgentIds(diagnoses, 'missing_session_mapping');
    return {
      reason: 'missing_session_mapping',
      nextAction: `repair or re-register the missing session mapping for ${agents} before resuming ${task.taskId}`,
      resumeHint: `re-run worker/orchestrator registration with --session-key and --session-id so zigrix can resolve the backing OpenClaw session`,
      reportLine: `${task.taskId}: BLOCKED missing_session_mapping (${agents})`,
    };
  }

  return {
    reason: 'stale_timeout',
    nextAction: `inspect the latest progress for ${task.taskId} and either report, refresh progress, or respawn the worker after ${hours}h of inactivity`,
    resumeHint: 'check task status/events/evidence, then continue with a fresh worker registration if the original session is no longer active',
    reportLine: `${task.taskId}: BLOCKED stale_timeout (> ${hours}h)`, 
  };
}

function buildStaleTaskSummary(task: ZigrixTask, hours: number, agentsStateDir?: string | null, fallbackReason = 'stale_timeout'): StaleTaskSummary | null {
  const cutoff = Date.now() - hours * 3600 * 1000;
  const timedOut = Date.parse(task.updatedAt) < cutoff;
  const diagnoses = diagnoseTaskSessions(task, agentsStateDir);
  const hasDeletedSession = diagnoses.some((item) => item.reason === 'session_dead');
  const hasMissingMapping = diagnoses.some((item) => item.reason === 'missing_session_mapping');

  if (!hasDeletedSession && !timedOut) return null;

  const reasons = new Set<StaleReasonCode>();
  if (timedOut) reasons.add('stale_timeout');
  if (hasDeletedSession) reasons.add('session_dead');
  if (hasMissingMapping) reasons.add('missing_session_mapping');

  const reasonCode: StaleReasonCode = hasDeletedSession
    ? 'session_dead'
    : hasMissingMapping && timedOut
      ? 'missing_session_mapping'
      : 'stale_timeout';

  const guidance = buildStaleGuidance(task, reasonCode, hours, diagnoses);
  const reason = reasonCode === 'stale_timeout' ? fallbackReason : guidance.reason;

  return {
    taskId: task.taskId,
    title: task.title,
    updatedAt: task.updatedAt,
    hoursThreshold: hours,
    timedOut,
    reason,
    reasonCode,
    reasons: Array.from(reasons),
    nextAction: guidance.nextAction,
    resumeHint: guidance.resumeHint,
    reportLine: guidance.reportLine,
    sessions: diagnoses,
  };
}

export function findStaleTasks(paths: ZigrixPaths, hours = 24, options: StalePolicyOptions = {}): StaleTaskSummary[] {
  return listTasks(paths)
    .filter((task) => task.status === 'IN_PROGRESS')
    .map((task) => buildStaleTaskSummary(task, hours, options.agentsStateDir, options.fallbackReason ?? 'stale_timeout'))
    .filter((task): task is StaleTaskSummary => task !== null);
}

export function applyStalePolicy(paths: ZigrixPaths, hours = 24, reason = 'stale_timeout', options: StalePolicyOptions = {}): Record<string, unknown> {
  const staleTasks = findStaleTasks(paths, hours, { ...options, fallbackReason: reason });
  const changed = staleTasks.map((summary) => {
    const task = loadTask(paths, summary.taskId);
    if (!task) return null;

    task.status = 'BLOCKED';
    task.nextAction = summary.nextAction;
    task.resumeHint = summary.resumeHint;
    task.staleReason = summary.reasonCode;
    task.staleReasons = summary.reasons;
    saveTask(paths, task);

    const event = appendEvent(paths.eventsFile, {
      event: 'task_blocked',
      taskId: task.taskId,
      phase: 'recovery',
      actor: 'zigrix',
      status: 'BLOCKED',
      payload: {
        reason: summary.reason,
        reasonCode: summary.reasonCode,
        reasons: summary.reasons,
        previousStatus: 'IN_PROGRESS',
        hoursThreshold: hours,
        timedOut: summary.timedOut,
        nextAction: summary.nextAction,
        resumeHint: summary.resumeHint,
        reportLine: summary.reportLine,
        sessions: summary.sessions,
      },
    });

    return {
      taskId: task.taskId,
      reason: summary.reason,
      reasonCode: summary.reasonCode,
      reasons: summary.reasons,
      nextAction: summary.nextAction,
      resumeHint: summary.resumeHint,
      reportLine: summary.reportLine,
      sessions: summary.sessions,
      event,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  rebuildIndex(paths);
  return { ok: true, hours, requestedReason: reason, count: changed.length, changed };
}

// ─── Index ──────────────────────────────────────────────────────────────────

export function rebuildIndex(paths: ZigrixPaths): Record<string, unknown> {
  ensureBaseState(paths);
  const tasks = listTasks(paths);
  const events = loadEvents(paths.eventsFile);
  const activeStatuses = new Set(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE_PENDING_REPORT']);
  const statusBuckets: Record<string, string[]> = {};
  const taskSummaries: Record<string, Record<string, unknown>> = {};
  const activeTasks: Record<string, Record<string, unknown>> = {};

  for (const task of tasks) {
    statusBuckets[task.status] ??= [];
    statusBuckets[task.status].push(task.taskId);
    const summary = {
      title: task.title,
      status: task.status,
      scale: task.scale,
      requiredAgents: task.requiredAgents,
      projectDir: task.projectDir ?? null,
      updatedAt: task.updatedAt,
    };
    taskSummaries[task.taskId] = summary;
    if (activeStatuses.has(task.status)) activeTasks[task.taskId] = summary;
  }

  const index = {
    version: '2.0',
    updatedAt: nowIso(),
    policy: {
      sourceOfTruth: 'tasks.jsonl',
      projection: 'index.json',
      qaRequiredForAllScales: true,
    },
    counts: { tasks: tasks.length, events: events.length },
    statusBuckets,
    activeTasks,
    taskSummaries,
  };
  fs.writeFileSync(paths.indexFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return index;
}
