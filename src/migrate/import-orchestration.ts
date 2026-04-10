import fs from 'node:fs';
import path from 'node:path';

import { loadEvents, nowIso } from '../state/events.js';
import { ensureBaseState, type ZigrixPaths } from '../state/paths.js';
import { rebuildIndex, type ZigrixTask } from '../state/tasks.js';
import { verifyState } from '../state/verify.js';

const TASK_ID_RE = /^(DEV|TEST|TASK)-(\d{8})-(\d{3})$/;

const ACTIVE_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE_PENDING_REPORT']);

type ImportSource = {
  baseDir: string;
  tasksDir: string;
  evidenceDir: string;
  promptsDir: string;
  eventsFile: string;
  indexFile: string;
};

type TaskSpecMetadata = {
  title?: string;
  requestedBy?: string;
  createdAt?: string;
  status?: string;
  scale?: string;
  description?: string;
  requiredAgents?: string[];
  orchestratorId?: string;
};

type ImportReport = {
  ok: boolean;
  action: 'migrate.import-orchestration';
  fromDir: string;
  destinationBaseDir: string;
  importedTaskIds: string[];
  synthesizedMetaTasks: string[];
  skippedTaskIds: string[];
  counts: {
    source: Record<string, number>;
    imported: Record<string, number>;
  };
  parity: {
    tasks: boolean;
    evidenceDirs: boolean;
    evidenceFiles: boolean;
    mergedFiles: boolean;
    prompts: boolean;
    events: boolean;
    statusBuckets: boolean;
    activeTasks: boolean;
  };
  stateCheck: Record<string, unknown>;
  warnings: string[];
  reportPath: string;
};

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function sameStringArray(left: string[], right: string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function collectJsonLines(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).length;
}

function collectFilesRecursive(baseDir: string): string[] {
  if (!fs.existsSync(baseDir)) return [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursive(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function resolveImportSource(fromDir: string): ImportSource {
  const baseDir = path.resolve(fromDir);
  const tasksDir = path.join(baseDir, 'tasks');
  const evidenceDir = path.join(baseDir, 'evidence');
  const promptsDir = path.join(baseDir, 'prompts');
  const eventsFile = path.join(baseDir, 'tasks.jsonl');
  const indexFile = path.join(baseDir, 'index.json');

  if (!fs.existsSync(baseDir)) throw new Error(`legacy orchestration dir not found: ${baseDir}`);
  if (!fs.existsSync(tasksDir)) throw new Error(`legacy tasks dir not found: ${tasksDir}`);
  if (!fs.existsSync(eventsFile)) throw new Error(`legacy tasks.jsonl not found: ${eventsFile}`);

  return { baseDir, tasksDir, evidenceDir, promptsDir, eventsFile, indexFile };
}

function ensureDestinationEmpty(paths: ZigrixPaths): void {
  ensureBaseState(paths);
  const taskFiles = fs.readdirSync(paths.tasksDir).filter((name) => /\.(meta\.json|json|md)$/.test(name));
  const evidenceFiles = collectFilesRecursive(paths.evidenceDir);
  const promptFiles = collectFilesRecursive(paths.promptsDir);
  const eventCount = collectJsonLines(paths.eventsFile);

  if (taskFiles.length || evidenceFiles.length || promptFiles.length || eventCount) {
    throw new Error(
      'refusing to import into non-empty runtime state; use a clean zigrix baseDir or run `zigrix reset state --yes` first',
    );
  }
}

function parseTaskSpecMarkdown(raw: string): TaskSpecMetadata {
  const pick = (patterns: RegExp[]): string | undefined => {
    for (const pattern of patterns) {
      const matched = raw.match(pattern);
      if (matched?.[1]) return matched[1].trim();
    }
    return undefined;
  };

  const parseAgents = (value?: string): string[] | undefined => {
    if (!value) return undefined;
    const items = value
      .split(',')
      .map((item) => item.replace(/`/g, '').trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  };

  const inScope = raw.match(/### In-Scope\n([\s\S]*?)(?:\n### Out-of-Scope|\n## )/);
  const description = inScope?.[1]
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');

  return {
    title: pick([/^- Title:\s*(.+)$/m, /^- \*\*Title:\*\*\s*(.+)$/m]),
    requestedBy: pick([/^- Requested by:\s*(.+)$/m]),
    createdAt: pick([/^- Created at \(KST\):\s*(.+)$/m, /^- Created:\s*(.+)$/m]),
    status: pick([/^- Current Status:\s*`?([^`\n]+)`?$/m, /^- Status:\s*`?([^`\n]+)`?$/m]),
    scale: pick([/^- Scale:\s*`?([^`\n]+)`?$/m]),
    description: description && description !== '-' ? description : undefined,
    requiredAgents: parseAgents(pick([/^- Required agents:\s*(.+)$/m, /^- \*\*Required Agents:\*\*\s*(.+)$/m])),
    orchestratorId: pick([/^- Orchestrator:\s*`?([^`\n]+)`?$/m]),
  };
}

function collectTaskIds(source: ImportSource, events: Array<Record<string, unknown>>): {
  taskIds: string[];
  skippedTaskIds: string[];
} {
  const supported = new Set<string>();
  const skipped = new Set<string>();

  const consider = (candidate: string | null) => {
    if (!candidate) return;
    if (TASK_ID_RE.test(candidate)) {
      supported.add(candidate);
    } else {
      skipped.add(candidate);
    }
  };

  for (const name of fs.readdirSync(source.tasksDir)) {
    if (name.endsWith('.meta.json')) consider(name.replace(/\.meta\.json$/, ''));
    if (name.endsWith('.json') && !name.endsWith('.meta.json')) consider(name.replace(/\.json$/, ''));
    if (name.endsWith('.md')) consider(name.replace(/\.md$/, ''));
  }

  if (fs.existsSync(source.evidenceDir)) {
    for (const name of fs.readdirSync(source.evidenceDir)) {
      const fullPath = path.join(source.evidenceDir, name);
      if (fs.statSync(fullPath).isDirectory()) consider(name);
    }
  }

  for (const event of events) {
    consider(toNonEmptyString(event.taskId));
  }

  return {
    taskIds: [...supported].sort(),
    skippedTaskIds: [...skipped].sort(),
  };
}

function groupEventsByTaskId(events: Array<Record<string, unknown>>): Map<string, Array<Record<string, unknown>>> {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const event of events) {
    const taskId = toNonEmptyString(event.taskId);
    if (!taskId) continue;
    grouped.set(taskId, [...(grouped.get(taskId) ?? []), event]);
  }
  return grouped;
}

function latestEventStatus(events: Array<Record<string, unknown>>): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const status = toNonEmptyString(events[index]?.status);
    if (status) return status;
  }
  return null;
}

function latestEventTimestamp(events: Array<Record<string, unknown>>): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const ts = toNonEmptyString(events[index]?.ts);
    if (ts) return ts;
  }
  return null;
}

function statusFromIndex(indexData: Record<string, unknown> | null, taskId: string): string | null {
  if (!indexData || typeof indexData.statusBuckets !== 'object' || !indexData.statusBuckets || Array.isArray(indexData.statusBuckets)) {
    return null;
  }
  for (const [status, rawTaskIds] of Object.entries(indexData.statusBuckets as Record<string, unknown>)) {
    if (toStringArray(rawTaskIds).includes(taskId)) return status;
  }
  return null;
}

function collectRequiredAgents(baseMeta: Record<string, unknown> | null, parsed: TaskSpecMetadata, events: Array<Record<string, unknown>>, evidenceAgents: string[]): string[] {
  const fromMeta = [
    ...toStringArray(baseMeta?.requiredAgents),
    ...toStringArray(baseMeta?.selectedAgents),
    ...toStringArray(baseMeta?.baselineRequiredAgents),
  ];
  if (fromMeta.length > 0) return [...new Set(fromMeta)].sort();
  if (parsed.requiredAgents?.length) return [...new Set(parsed.requiredAgents)].sort();

  const fromEvents = new Set<string>();
  for (const event of events) {
    toStringArray((event.payload as Record<string, unknown> | undefined)?.requiredAgents).forEach((agentId) => fromEvents.add(agentId));
    toStringArray(event.requiredAgents).forEach((agentId) => fromEvents.add(agentId));
    const targetAgent = toNonEmptyString(event.targetAgent);
    if (targetAgent) fromEvents.add(targetAgent);
    const payloadAgent = toNonEmptyString((event.payload as Record<string, unknown> | undefined)?.agentId);
    if (payloadAgent) fromEvents.add(payloadAgent);
    const topAgent = toNonEmptyString(event.agentId);
    if (topAgent) fromEvents.add(topAgent);
  }
  evidenceAgents.forEach((agentId) => fromEvents.add(agentId));

  return [...fromEvents].sort();
}

function resolveAgentIdFromEvent(event: Record<string, unknown>): string | null {
  return toNonEmptyString(event.targetAgent)
    ?? toNonEmptyString(event.agentId)
    ?? toNonEmptyString((event.payload as Record<string, unknown> | undefined)?.agentId)
    ?? null;
}

function collectWorkerSessions(baseMeta: Record<string, unknown> | null, events: Array<Record<string, unknown>>, evidenceDir: string): Record<string, unknown> {
  const workerSessions = baseMeta?.workerSessions && typeof baseMeta.workerSessions === 'object' && !Array.isArray(baseMeta.workerSessions)
    ? structuredClone(baseMeta.workerSessions as Record<string, unknown>)
    : {};

  const updateWorker = (agentId: string, patch: Record<string, unknown>) => {
    const current = workerSessions[agentId] && typeof workerSessions[agentId] === 'object' && !Array.isArray(workerSessions[agentId])
      ? workerSessions[agentId] as Record<string, unknown>
      : {};
    workerSessions[agentId] = {
      ...current,
      ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== null && value !== undefined && value !== '')),
    };
  };

  for (const event of events) {
    const eventName = toNonEmptyString(event.event);
    const agentId = resolveAgentIdFromEvent(event);
    if (!agentId) continue;

    const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown>
      : {};
    const result = toNonEmptyString(payload.result);
    const status = eventName === 'worker_dispatched'
      ? 'dispatched'
      : eventName === 'worker_done'
        ? (result ?? 'done')
        : eventName === 'worker_started'
          ? 'in_progress'
          : eventName === 'evidence_collected'
            ? 'done'
            : null;

    updateWorker(agentId, {
      sessionKey: toNonEmptyString(event.sessionKey),
      sessionId: toNonEmptyString(event.sessionId),
      runId: toNonEmptyString(event.runId),
      unitId: toNonEmptyString(event.unitId),
      workPackage: toNonEmptyString(event.workPackage),
      status,
    });
  }

  if (fs.existsSync(evidenceDir)) {
    for (const fileName of fs.readdirSync(evidenceDir).filter((name) => name.endsWith('.json') && name !== '_merged.json')) {
      const data = readJson(path.join(evidenceDir, fileName));
      if (!data) continue;
      const agentId = toNonEmptyString(data.agentId) ?? fileName.replace(/\.json$/, '');
      if (!agentId) continue;
      updateWorker(agentId, {
        sessionKey: toNonEmptyString(data.sessionKey),
        sessionId: toNonEmptyString(data.sessionId),
        runId: toNonEmptyString(data.runId),
        unitId: toNonEmptyString(data.unitId),
        status: 'done',
      });
    }
  }

  return workerSessions;
}

function detectOrchestrator(baseMeta: Record<string, unknown> | null, parsed: TaskSpecMetadata, events: Array<Record<string, unknown>>): {
  orchestratorId?: string;
  orchestratorSessionKey?: string;
  orchestratorSessionId?: string;
} {
  const result: {
    orchestratorId?: string;
    orchestratorSessionKey?: string;
    orchestratorSessionId?: string;
  } = {};

  const baseOrchestratorId = toNonEmptyString(baseMeta?.orchestratorId) ?? parsed.orchestratorId ?? null;
  if (baseOrchestratorId) result.orchestratorId = baseOrchestratorId;
  const baseSessionKey = toNonEmptyString(baseMeta?.orchestratorSessionKey);
  const baseSessionId = toNonEmptyString(baseMeta?.orchestratorSessionId);
  if (baseSessionKey) result.orchestratorSessionKey = baseSessionKey;
  if (baseSessionId) result.orchestratorSessionId = baseSessionId;

  for (const event of events) {
    const eventName = toNonEmptyString(event.event);
    if (!eventName) continue;
    if (eventName === 'dispatch_started') {
      const orchestrator = event.orchestrator && typeof event.orchestrator === 'object' && !Array.isArray(event.orchestrator)
        ? event.orchestrator as Record<string, unknown>
        : null;
      const orchestratorId = toNonEmptyString(orchestrator?.agentId) ?? toNonEmptyString(event.actor);
      const sessionKey = toNonEmptyString(orchestrator?.sessionKey) ?? toNonEmptyString(event.sessionKey);
      const sessionId = toNonEmptyString(orchestrator?.sessionId) ?? toNonEmptyString(event.sessionId);
      if (orchestratorId) result.orchestratorId = orchestratorId;
      if (sessionKey) result.orchestratorSessionKey = sessionKey;
      if (sessionId) result.orchestratorSessionId = sessionId;
    }

    if (eventName === 'task_started' && !result.orchestratorSessionKey) {
      const sessionKey = toNonEmptyString(event.sessionKey);
      const sessionId = toNonEmptyString(event.sessionId);
      const actor = toNonEmptyString(event.actor);
      if (actor) result.orchestratorId = actor;
      if (sessionKey) result.orchestratorSessionKey = sessionKey;
      if (sessionId) result.orchestratorSessionId = sessionId;
    }
  }

  return result;
}

function detectQaAgentId(requiredAgents: string[]): string | undefined {
  return requiredAgents.find((agentId) => /(^qa[-_]|-qa$|\bqa\b|quality|test)/i.test(agentId));
}

function normalizeLegacyTask(params: {
  taskId: string;
  baseMeta: Record<string, unknown> | null;
  parsedSpec: TaskSpecMetadata;
  events: Array<Record<string, unknown>>;
  evidenceDir: string;
  sourceIndex: Record<string, unknown> | null;
}): ZigrixTask {
  const { taskId, baseMeta, parsedSpec, events, evidenceDir, sourceIndex } = params;
  const evidenceAgents = fs.existsSync(evidenceDir)
    ? fs.readdirSync(evidenceDir).filter((name) => name.endsWith('.json') && name !== '_merged.json').map((name) => name.replace(/\.json$/, '')).sort()
    : [];
  const requiredAgents = collectRequiredAgents(baseMeta, parsedSpec, events, evidenceAgents);
  const workerSessions = collectWorkerSessions(baseMeta, events, evidenceDir);
  const orchestrator = detectOrchestrator(baseMeta, parsedSpec, events);

  const title = toNonEmptyString(baseMeta?.title) ?? parsedSpec.title ?? taskId;
  const description = toNonEmptyString(baseMeta?.description) ?? parsedSpec.description ?? title;
  const scale = toNonEmptyString(baseMeta?.scale) ?? parsedSpec.scale ?? 'normal';
  const createdAt = toNonEmptyString(baseMeta?.createdAt) ?? parsedSpec.createdAt ?? latestEventTimestamp(events) ?? nowIso();
  const updatedAt = toNonEmptyString(baseMeta?.updatedAt) ?? latestEventTimestamp(events) ?? createdAt;
  const status = toNonEmptyString(baseMeta?.status)
    ?? latestEventStatus(events)
    ?? statusFromIndex(sourceIndex, taskId)
    ?? parsedSpec.status
    ?? 'OPEN';
  const requestedBy = toNonEmptyString(baseMeta?.requestedBy) ?? parsedSpec.requestedBy ?? undefined;
  const projectDir = toNonEmptyString(baseMeta?.projectDir) ?? toNonEmptyString(baseMeta?.projectPath) ?? undefined;

  const normalized = {
    ...((baseMeta as unknown as ZigrixTask | null) ?? {}),
    taskId,
    title,
    description,
    scale,
    status,
    createdAt,
    updatedAt,
    requiredAgents,
    workerSessions,
    ...(requestedBy ? { requestedBy } : {}),
    ...(projectDir ? { projectDir } : {}),
    ...(orchestrator.orchestratorId ? { orchestratorId: orchestrator.orchestratorId } : {}),
    ...(orchestrator.orchestratorSessionKey ? { orchestratorSessionKey: orchestrator.orchestratorSessionKey } : {}),
    ...(orchestrator.orchestratorSessionId ? { orchestratorSessionId: orchestrator.orchestratorSessionId } : {}),
    ...(toNonEmptyString(baseMeta?.qaAgentId) || detectQaAgentId(requiredAgents)
      ? { qaAgentId: toNonEmptyString(baseMeta?.qaAgentId) ?? detectQaAgentId(requiredAgents) }
      : {}),
  } as ZigrixTask;

  return normalized;
}

function buildLegacyQaVerification(task: ZigrixTask, presentAgents: string[], existing: Record<string, unknown> | null): Record<string, unknown> {
  const current = existing?.qaVerification && typeof existing.qaVerification === 'object' && !Array.isArray(existing.qaVerification)
    ? existing.qaVerification as Record<string, unknown>
    : null;
  if (current) return current;

  const qaAgentId = toNonEmptyString(existing?.qaAgentId) ?? task.qaAgentId ?? detectQaAgentId(task.requiredAgents) ?? null;
  const qaPresent = qaAgentId ? presentAgents.includes(qaAgentId) : false;
  return {
    required: qaPresent,
    mappingCount: 0,
    mappings: [],
    complete: true,
    importedLegacy: true,
  };
}

function buildMergedItemsFromEvidence(evidenceDir: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(evidenceDir)) return [];
  const files = fs.readdirSync(evidenceDir).filter((name) => name.endsWith('.json') && name !== '_merged.json').sort();
  return files.flatMap((fileName) => {
    const data = readJson(path.join(evidenceDir, fileName));
    if (!data) return [];
    const agentId = toNonEmptyString(data.agentId) ?? fileName.replace(/\.json$/, '');
    if (!agentId) return [];
    return [{
      agentId,
      unitId: data.unitId ?? null,
      runId: data.runId ?? '',
      sessionKey: data.sessionKey ?? null,
      sessionId: data.sessionId ?? null,
      transcriptPath: data.transcriptPath ?? null,
      evidence: data.evidence ?? {},
    }];
  });
}

function importTaskEvidence(source: ImportSource, destination: ZigrixPaths, task: ZigrixTask): void {
  const sourceDir = path.join(source.evidenceDir, task.taskId);
  if (!fs.existsSync(sourceDir)) return;

  const destinationDir = path.join(destination.evidenceDir, task.taskId);
  fs.mkdirSync(destinationDir, { recursive: true });

  for (const filePath of collectFilesRecursive(sourceDir)) {
    const relative = path.relative(sourceDir, filePath);
    if (path.basename(filePath) === '_merged.json') continue;
    const targetPath = path.join(destinationDir, relative);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(filePath, targetPath);
  }

  const sourceMerged = readJson(path.join(sourceDir, '_merged.json'));
  const items = buildMergedItemsFromEvidence(destinationDir);
  if (!sourceMerged && items.length === 0) return;

  const presentAgents = items.map((item) => String(item.agentId)).sort();
  const requiredAgents = toStringArray(sourceMerged?.requiredAgents);
  const normalizedRequiredAgents = requiredAgents.length > 0 ? requiredAgents : task.requiredAgents;
  const qaAgentId = toNonEmptyString(sourceMerged?.qaAgentId) ?? task.qaAgentId ?? detectQaAgentId(normalizedRequiredAgents) ?? null;
  const qaPresent = typeof sourceMerged?.qaPresent === 'boolean'
    ? Boolean(sourceMerged.qaPresent)
    : Boolean(qaAgentId && presentAgents.includes(qaAgentId));
  const qaVerification = buildLegacyQaVerification(task, presentAgents, sourceMerged);
  const missingAgents = toStringArray(sourceMerged?.missingAgents).length > 0
    ? toStringArray(sourceMerged?.missingAgents)
    : normalizedRequiredAgents.filter((agentId) => !presentAgents.includes(agentId));
  const complete = typeof sourceMerged?.complete === 'boolean'
    ? Boolean(sourceMerged.complete)
    : missingAgents.length === 0 && (!(qaVerification.required === true) || qaVerification.complete === true);

  const merged = {
    ...(sourceMerged ?? {}),
    ts: toNonEmptyString(sourceMerged?.ts) ?? task.updatedAt,
    taskId: task.taskId,
    requiredAgents: normalizedRequiredAgents,
    presentAgents,
    missingAgents,
    qaAgentId,
    qaPresent,
    qaVerification,
    complete,
    items: sourceMerged?.items && Array.isArray(sourceMerged.items) ? sourceMerged.items : items,
  };

  fs.writeFileSync(path.join(destinationDir, '_merged.json'), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

function normalizeImportedEvent(event: Record<string, unknown>): Record<string, unknown> {
  const { timestamp: _legacyTimestamp, ...rest } = event;
  return {
    ...rest,
    ts: toNonEmptyString(event.ts) ?? nowIso(),
    payload: event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload
      : {},
  };
}

function writeEventsFile(eventsFile: string, events: Array<Record<string, unknown>>): void {
  const normalized = events.map((event) => normalizeImportedEvent(event));
  fs.writeFileSync(eventsFile, `${normalized.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
}

function writeTaskFiles(paths: ZigrixPaths, task: ZigrixTask, sourceMdPath: string | null): void {
  fs.writeFileSync(path.join(paths.tasksDir, `${task.taskId}.meta.json`), `${JSON.stringify(task, null, 2)}\n`, 'utf8');
  const destinationMd = path.join(paths.tasksDir, `${task.taskId}.md`);
  if (sourceMdPath && fs.existsSync(sourceMdPath)) {
    fs.copyFileSync(sourceMdPath, destinationMd);
    return;
  }
  fs.writeFileSync(destinationMd, `# Task Spec\n\n## 0) Task Metadata\n- Task ID: \`${task.taskId}\`\n- Title: ${task.title}\n- Scale: \`${task.scale}\`\n- Status: \`${task.status}\`\n\n## 1) Scope\n${task.description}\n`, 'utf8');
}

function copyPrompts(source: ImportSource, destination: ZigrixPaths): number {
  if (!fs.existsSync(source.promptsDir)) return 0;
  const promptFiles = collectFilesRecursive(source.promptsDir);
  for (const filePath of promptFiles) {
    const relative = path.relative(source.promptsDir, filePath);
    const targetPath = path.join(destination.promptsDir, relative);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(filePath, targetPath);
  }
  return promptFiles.length;
}

function computeSourceCounts(source: ImportSource, taskIds: string[], events: Array<Record<string, unknown>>): Record<string, number> {
  const evidenceDirs = fs.existsSync(source.evidenceDir)
    ? fs.readdirSync(source.evidenceDir).filter((name) => fs.statSync(path.join(source.evidenceDir, name)).isDirectory() && taskIds.includes(name)).length
    : 0;
  const evidenceJsonFiles = fs.existsSync(source.evidenceDir)
    ? collectFilesRecursive(source.evidenceDir).filter((filePath) => filePath.endsWith('.json'))
    : [];
  const mergedFiles = evidenceJsonFiles.filter((filePath) => path.basename(filePath) === '_merged.json').length;
  const evidenceFiles = evidenceJsonFiles.length - mergedFiles;
  const prompts = fs.existsSync(source.promptsDir) ? collectFilesRecursive(source.promptsDir).length : 0;

  return {
    tasks: taskIds.length,
    evidenceDirs,
    evidenceFiles,
    mergedFiles,
    prompts,
    events: events.length,
  };
}

function computeImportedCounts(paths: ZigrixPaths): Record<string, number> {
  const tasks = fs.readdirSync(paths.tasksDir).filter((name) => name.endsWith('.meta.json')).length;
  const evidenceDirs = fs.existsSync(paths.evidenceDir)
    ? fs.readdirSync(paths.evidenceDir).filter((name) => fs.statSync(path.join(paths.evidenceDir, name)).isDirectory()).length
    : 0;
  const evidenceJsonFiles = fs.existsSync(paths.evidenceDir)
    ? collectFilesRecursive(paths.evidenceDir).filter((filePath) => filePath.endsWith('.json'))
    : [];
  const mergedFiles = evidenceJsonFiles.filter((filePath) => path.basename(filePath) === '_merged.json').length;
  const evidenceFiles = evidenceJsonFiles.length - mergedFiles;
  const prompts = collectFilesRecursive(paths.promptsDir).length;
  const events = collectJsonLines(paths.eventsFile);
  return { tasks, evidenceDirs, evidenceFiles, mergedFiles, prompts, events };
}

function filteredStatusBuckets(indexData: Record<string, unknown> | null, supportedTaskIds: string[]): Record<string, string[]> {
  if (!indexData || typeof indexData.statusBuckets !== 'object' || !indexData.statusBuckets || Array.isArray(indexData.statusBuckets)) {
    return {};
  }
  const supported = new Set(supportedTaskIds);
  const buckets: Record<string, string[]> = {};
  for (const [status, rawTaskIds] of Object.entries(indexData.statusBuckets as Record<string, unknown>)) {
    buckets[status] = toStringArray(rawTaskIds).filter((taskId) => supported.has(taskId)).sort();
  }
  return buckets;
}

function compareStatusBuckets(sourceIndex: Record<string, unknown> | null, destIndex: Record<string, unknown> | null, taskIds: string[]): boolean {
  if (!sourceIndex) return true;
  const sourceBuckets = filteredStatusBuckets(sourceIndex, taskIds);
  const destBuckets = filteredStatusBuckets(destIndex, taskIds);
  const statuses = new Set([...Object.keys(sourceBuckets), ...Object.keys(destBuckets)]);
  for (const status of statuses) {
    if (!sameStringArray(sourceBuckets[status] ?? [], destBuckets[status] ?? [])) return false;
  }
  return true;
}

function compareActiveTasks(sourceIndex: Record<string, unknown> | null, destIndex: Record<string, unknown> | null, taskIds: string[]): boolean {
  if (!sourceIndex) return true;
  const supported = new Set(taskIds);
  const sourceActive = sourceIndex && typeof sourceIndex.activeTasks === 'object' && sourceIndex.activeTasks && !Array.isArray(sourceIndex.activeTasks)
    ? Object.keys(sourceIndex.activeTasks as Record<string, unknown>).filter((taskId) => supported.has(taskId)).sort()
    : taskIds.filter((taskId) => ACTIVE_STATUSES.has(statusFromIndex(sourceIndex, taskId) ?? '')).sort();
  const destActive = destIndex && typeof destIndex.activeTasks === 'object' && destIndex.activeTasks && !Array.isArray(destIndex.activeTasks)
    ? Object.keys(destIndex.activeTasks as Record<string, unknown>).filter((taskId) => supported.has(taskId)).sort()
    : [];
  return sameStringArray(sourceActive, destActive);
}

function saveImportReport(paths: ZigrixPaths, report: Omit<ImportReport, 'reportPath'>): string {
  fs.mkdirSync(paths.runsDir, { recursive: true });
  const stamp = nowIso().replaceAll(':', '').replace(/\.\d+/, '');
  const reportPath = path.join(paths.runsDir, `migration-import-orchestration-${stamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify({ ...report, reportPath }, null, 2)}\n`, 'utf8');
  return reportPath;
}

export function importOrchestrationState(paths: ZigrixPaths, params: { fromDir: string }): ImportReport {
  const source = resolveImportSource(params.fromDir);
  ensureDestinationEmpty(paths);
  ensureBaseState(paths);

  const sourceEvents = loadEvents(source.eventsFile);
  const sourceIndex = readJson(source.indexFile);
  const { taskIds, skippedTaskIds } = collectTaskIds(source, sourceEvents);
  const eventsByTaskId = groupEventsByTaskId(sourceEvents);
  const synthesizedMetaTasks: string[] = [];
  const warnings: string[] = [];

  for (const skippedTaskId of skippedTaskIds) {
    warnings.push(`unsupported legacy task id skipped from task import: ${skippedTaskId}`);
  }

  for (const taskId of taskIds) {
    const sourceMetaPath = path.join(source.tasksDir, `${taskId}.meta.json`);
    const sourceLegacyJsonPath = path.join(source.tasksDir, `${taskId}.json`);
    const sourceMdPath = path.join(source.tasksDir, `${taskId}.md`);

    const baseMeta = readJson(sourceMetaPath) ?? readJson(sourceLegacyJsonPath);
    if (!baseMeta) synthesizedMetaTasks.push(taskId);

    const parsedSpec = fs.existsSync(sourceMdPath)
      ? parseTaskSpecMarkdown(readText(sourceMdPath) ?? '')
      : {};
    const evidenceDir = path.join(source.evidenceDir, taskId);
    const normalizedTask = normalizeLegacyTask({
      taskId,
      baseMeta,
      parsedSpec,
      events: eventsByTaskId.get(taskId) ?? [],
      evidenceDir,
      sourceIndex,
    });

    writeTaskFiles(paths, normalizedTask, fs.existsSync(sourceMdPath) ? sourceMdPath : null);
    importTaskEvidence(source, paths, normalizedTask);
  }

  const promptCount = copyPrompts(source, paths);
  writeEventsFile(paths.eventsFile, sourceEvents);
  const rebuiltIndex = rebuildIndex(paths) as Record<string, unknown>;
  const stateCheck = verifyState(paths);

  const sourceCounts = computeSourceCounts(source, taskIds, sourceEvents);
  const importedCounts = computeImportedCounts(paths);
  const parity = {
    tasks: sourceCounts.tasks === importedCounts.tasks,
    evidenceDirs: sourceCounts.evidenceDirs === importedCounts.evidenceDirs,
    evidenceFiles: sourceCounts.evidenceFiles === importedCounts.evidenceFiles,
    mergedFiles: importedCounts.mergedFiles >= sourceCounts.mergedFiles,
    prompts: sourceCounts.prompts === importedCounts.prompts,
    events: sourceCounts.events === importedCounts.events,
    statusBuckets: compareStatusBuckets(sourceIndex, rebuiltIndex, taskIds),
    activeTasks: compareActiveTasks(sourceIndex, rebuiltIndex, taskIds),
  };

  if (promptCount !== sourceCounts.prompts) {
    warnings.push(`prompt copy count mismatch: expected ${sourceCounts.prompts}, got ${promptCount}`);
  }
  if (importedCounts.mergedFiles !== sourceCounts.mergedFiles) {
    warnings.push(`merged evidence file count changed during import: source=${sourceCounts.mergedFiles}, imported=${importedCounts.mergedFiles}`);
  }

  const reportWithoutPath: Omit<ImportReport, 'reportPath'> = {
    ok: Object.values(parity).every(Boolean) && stateCheck.ok === true,
    action: 'migrate.import-orchestration',
    fromDir: source.baseDir,
    destinationBaseDir: paths.baseDir,
    importedTaskIds: taskIds,
    synthesizedMetaTasks,
    skippedTaskIds,
    counts: {
      source: sourceCounts,
      imported: importedCounts,
    },
    parity,
    stateCheck,
    warnings,
  };

  const reportPath = saveImportReport(paths, reportWithoutPath);
  return { ...reportWithoutPath, reportPath };
}
