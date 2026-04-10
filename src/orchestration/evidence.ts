import fs from 'node:fs';
import path from 'node:path';

import { appendEvent, nowIso } from '../state/events.js';
import { type ZigrixPaths, ensureBaseState } from '../state/paths.js';
import { type ZigrixTask, loadTask, rebuildIndex } from '../state/tasks.js';
import { resolveRequiredAgents } from './worker.js';

export type VerificationMapping = {
  dod: string;
  test: string;
};

function readTranscript(transcriptPath: string, limit = 40): Array<Record<string, unknown>> {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];
  return fs.readFileSync(transcriptPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        return [parsed];
      } catch {
        return [];
      }
    });
}

function extractEvidence(rows: Array<Record<string, unknown>>): Record<string, unknown> {
  let lastAssistant: unknown = null;
  const toolResults: unknown[] = [];
  for (const row of rows) {
    if (row.role === 'assistant' && row.content) lastAssistant = row.content;
    if (row.role === 'toolResult') toolResults.push(row.content);
  }
  return { lastAssistant, toolResults: toolResults.slice(-3) };
}

function resolveQaAgentId(task: ZigrixTask): string | null {
  if (typeof task.qaAgentId === 'string' && task.qaAgentId.trim().length > 0) {
    return task.qaAgentId.trim();
  }

  const roleMap = task.roleAgentMap;
  if (roleMap && typeof roleMap === 'object') {
    const qaAgents = (roleMap as Record<string, unknown>).qa;
    if (Array.isArray(qaAgents) && qaAgents.length > 0) {
      const fromRoleMap = String(qaAgents[0]).trim();
      if (fromRoleMap.length > 0) return fromRoleMap;
    }
  }

  const required = Array.isArray(task.requiredAgents) ? task.requiredAgents : [];
  if (required.length === 1) {
    const only = String(required[0]).trim();
    if (only.length > 0) return only;
  }

  const orchestratorId = typeof task.orchestratorId === 'string' && task.orchestratorId.trim().length > 0
    ? task.orchestratorId.trim()
    : null;
  const fallback = required.find((agentId) => String(agentId).trim().length > 0 && String(agentId).trim() !== orchestratorId);
  return fallback ? String(fallback).trim() : null;
}

function sanitizeVerificationMapping(mapping: VerificationMapping): VerificationMapping | null {
  const dod = mapping.dod.trim();
  const test = mapping.test.trim();
  if (!dod || !test) return null;
  return { dod, test };
}

function collectVerificationMappings(evidence: Record<string, unknown>): VerificationMapping[] {
  const verification = evidence.verification;
  if (!verification || typeof verification !== 'object' || Array.isArray(verification)) return [];
  const rawMappings = (verification as Record<string, unknown>).mappings;
  if (!Array.isArray(rawMappings)) return [];
  return rawMappings.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const dod = typeof (item as Record<string, unknown>).dod === 'string' ? String((item as Record<string, unknown>).dod) : '';
    const test = typeof (item as Record<string, unknown>).test === 'string' ? String((item as Record<string, unknown>).test) : '';
    const sanitized = sanitizeVerificationMapping({ dod, test });
    return sanitized ? [sanitized] : [];
  });
}

export function collectEvidence(paths: ZigrixPaths, params: {
  taskId: string;
  agentId: string;
  runId?: string;
  unitId?: string;
  sessionKey?: string;
  sessionId?: string;
  transcript?: string;
  summary?: string;
  toolResults?: string[];
  notes?: string;
  dodItems?: string[];
  testCases?: string[];
  verificationMappings?: VerificationMapping[];
  limit?: number;
}): Record<string, unknown> | null {
  ensureBaseState(paths);
  const task = loadTask(paths, params.taskId);
  if (!task) return null;
  const transcriptRows = params.transcript ? readTranscript(path.resolve(params.transcript), params.limit ?? 40) : [];
  const extracted = extractEvidence(transcriptRows);
  if (params.summary) {
    extracted.summary = params.summary;
    extracted.lastAssistant = params.summary;
  }
  if (params.toolResults?.length) extracted.toolResults = [...params.toolResults];
  if (params.notes) extracted.notes = params.notes;

  const dodItems = (params.dodItems ?? []).map((item) => item.trim()).filter(Boolean);
  const testCases = (params.testCases ?? []).map((item) => item.trim()).filter(Boolean);
  const verificationMappings = (params.verificationMappings ?? [])
    .map((mapping) => sanitizeVerificationMapping(mapping))
    .filter((mapping): mapping is VerificationMapping => Boolean(mapping));
  if (dodItems.length || testCases.length || verificationMappings.length) {
    extracted.verification = {
      dodItems,
      testCases,
      mappings: verificationMappings,
    };
  }

  const outDir = path.join(paths.evidenceDir, params.taskId);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${params.agentId}.json`);
  const payload = {
    ts: nowIso(), taskId: params.taskId, agentId: params.agentId, unitId: params.unitId ?? null,
    runId: params.runId ?? '', sessionKey: params.sessionKey ?? null, sessionId: params.sessionId ?? null,
    transcriptPath: params.transcript ? path.resolve(params.transcript) : null, evidence: extracted,
  };
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  appendEvent(paths.eventsFile, {
    event: 'evidence_collected', taskId: params.taskId, phase: 'verification', actor: params.agentId, status: 'IN_PROGRESS', unitId: params.unitId ?? null,
    sessionKey: params.sessionKey ?? null, payload: { agentId: params.agentId, runId: params.runId ?? '', evidencePath: outPath },
  });
  rebuildIndex(paths);
  return { ok: true, taskId: params.taskId, agentId: params.agentId, evidencePath: outPath, sessionId: params.sessionId ?? null, unitId: params.unitId ?? null };
}

export function mergeEvidence(paths: ZigrixPaths, params: { taskId: string; requiredAgents?: string[]; requireQa?: boolean }): Record<string, unknown> | null {
  const task = loadTask(paths, params.taskId);
  if (!task) return null;
  const taskDir = path.join(paths.evidenceDir, params.taskId);
  fs.mkdirSync(taskDir, { recursive: true });
  const files = fs.readdirSync(taskDir).filter((name) => name.endsWith('.json') && name !== '_merged.json').sort();
  const items = files.flatMap((file) => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(taskDir, file), 'utf8')) as Record<string, unknown>;
      const agentId = String(data.agentId ?? path.basename(file, '.json'));
      return [{ agentId, unitId: data.unitId, runId: data.runId, sessionKey: data.sessionKey, sessionId: data.sessionId, transcriptPath: data.transcriptPath, evidence: data.evidence ?? {} }];
    } catch {
      return [];
    }
  });
  const presentAgents = [...new Set(items.map((item) => String(item.agentId)))].sort();
  const requiredAgents = [...(params.requiredAgents?.length ? params.requiredAgents : resolveRequiredAgents(task))];
  const missingAgents = requiredAgents.filter((agentId) => !presentAgents.includes(agentId));
  const qaAgentId = resolveQaAgentId(task);
  const qaPresent = qaAgentId ? presentAgents.includes(qaAgentId) : false;
  const qaRequiredSatisfied = !(params.requireQa ?? false) || (qaAgentId !== null && qaPresent);

  const qaVerificationMappings = qaAgentId
    ? items
      .filter((item) => String(item.agentId) === qaAgentId)
      .flatMap((item) => collectVerificationMappings(item.evidence as Record<string, unknown>))
    : [];
  const qaVerification = {
    required: Boolean(params.requireQa),
    mappingCount: qaVerificationMappings.length,
    mappings: qaVerificationMappings,
    complete: !(params.requireQa ?? false) || !qaPresent || qaVerificationMappings.length > 0,
  };

  const complete = missingAgents.length === 0 && qaRequiredSatisfied && qaVerification.complete;
  const merged = {
    ts: nowIso(),
    taskId: params.taskId,
    requiredAgents,
    presentAgents,
    missingAgents,
    qaAgentId,
    qaPresent,
    qaVerification,
    complete,
    items,
  };
  const outPath = path.join(taskDir, '_merged.json');
  fs.writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  appendEvent(paths.eventsFile, {
    event: 'evidence_merged', taskId: params.taskId, phase: 'verification', actor: 'zigrix', status: complete ? 'DONE_PENDING_REPORT' : 'IN_PROGRESS',
    payload: {
      requiredAgents,
      missingAgents,
      complete,
      mergedPath: outPath,
      qaPresent,
      qaVerificationComplete: qaVerification.complete,
      qaVerificationMappingCount: qaVerification.mappingCount,
    },
  });
  rebuildIndex(paths);
  return {
    ok: true,
    taskId: params.taskId,
    complete,
    missingAgents,
    qaAgentId,
    qaPresent,
    qaVerificationComplete: qaVerification.complete,
    qaVerificationMappingCount: qaVerification.mappingCount,
    mergedPath: outPath,
  };
}
