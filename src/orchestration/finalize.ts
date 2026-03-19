import fs from 'node:fs';
import path from 'node:path';

import { appendEvent } from '../state/events.js';
import { type ZigrixPaths } from '../state/paths.js';
import { type ZigrixTask, loadTask, rebuildIndex, saveTask } from '../state/tasks.js';
import { mergeEvidence } from './evidence.js';
import { renderReport } from './report.js';
import { resolveRequiredAgents } from './worker.js';

// ─── Unit completeness ─────────────────────────────────────────────────────

function autoCloseCompletedUnits(task: ZigrixTask): boolean {
  const units = task.executionUnits;
  if (!units?.length) return false;

  // Build set of agents that have completed their work
  const doneAgents = new Set<string>();
  for (const [agentId, session] of Object.entries(task.workerSessions)) {
    const s = session as Record<string, unknown>;
    if (s.status === 'done') doneAgents.add(agentId);
  }
  // orchestrator is always "done" at finalize time
  doneAgents.add(task.orchestratorId ?? 'pro-zig');

  let changed = false;
  for (const unit of units) {
    if (['OPEN', 'IN_PROGRESS'].includes(unit.status.toUpperCase()) && doneAgents.has(unit.owner)) {
      unit.status = 'DONE';
      changed = true;
    }
  }
  return changed;
}

function summarizeUnits(task: ZigrixTask): {
  hasUnits: boolean;
  complete: boolean;
  missingUnits: Array<{ id: string; title: string; status: string; owner: string | null }>;
  missingWorkPackages: string[];
} {
  const units = task.executionUnits;
  if (!units?.length) {
    return { hasUnits: false, complete: true, missingUnits: [], missingWorkPackages: [] };
  }

  const missing: Array<{ id: string; title: string; status: string; owner: string | null }> = [];
  const missingWp = new Set<string>();

  for (const unit of units) {
    if (unit.status.toUpperCase() !== 'DONE') {
      missing.push({ id: unit.id, title: unit.title, status: unit.status, owner: unit.owner ?? null });
      if (unit.workPackage) missingWp.add(unit.workPackage);
    }
  }

  return {
    hasUnits: true,
    complete: missing.length === 0,
    missingUnits: missing,
    missingWorkPackages: [...missingWp].sort(),
  };
}

// ─── Finalize ───────────────────────────────────────────────────────────────

export function finalizeTask(paths: ZigrixPaths, params: {
  taskId: string;
  autoReport?: boolean;
  secIssues?: boolean;
  qaIssues?: boolean;
}): Record<string, unknown> | null {
  const task = loadTask(paths, params.taskId);
  if (!task) return null;

  const steps: Array<Record<string, unknown>> = [];
  const reqAgents = resolveRequiredAgents(task);

  // Auto-close units whose owners have completed
  if (autoCloseCompletedUnits(task)) {
    saveTask(paths, task);
  }

  // Merge evidence
  const merged = mergeEvidence(paths, { taskId: params.taskId, requiredAgents: reqAgents, requireQa: true });
  steps.push({ step: 'merge_evidence', result: merged });

  const agentComplete = Boolean(merged?.complete);
  const missingAgents = Array.isArray(merged?.missingAgents) ? (merged.missingAgents as string[]) : [];

  // Unit completeness
  const unitSummary = summarizeUnits(task);
  steps.push({
    step: 'unit_completeness',
    hasUnits: unitSummary.hasUnits,
    complete: unitSummary.complete,
    missingUnits: unitSummary.missingUnits,
    missingWorkPackages: unitSummary.missingWorkPackages,
  });

  const complete = agentComplete && unitSummary.complete;

  if (params.autoReport && complete) {
    if (params.secIssues || params.qaIssues) {
      // Needs owner confirmation
      task.status = 'DONE_PENDING_REPORT';
      saveTask(paths, task);
      appendEvent(paths.eventsFile, {
        event: 'owner_confirmation_required',
        taskId: params.taskId,
        phase: 'reporting',
        actor: 'zigrix',
        status: 'DONE_PENDING_REPORT',
        payload: { securityIssues: params.secIssues, qaIssues: params.qaIssues },
      });
      steps.push({ step: 'owner_confirmation_required', ok: true });
    } else {
      // Auto report
      const report = renderReport(paths, { taskId: params.taskId, recordEvents: true });
      steps.push({ step: 'report_render', result: report });
      task.status = 'REPORTED';
      saveTask(paths, task);
      appendEvent(paths.eventsFile, {
        event: 'reported',
        taskId: params.taskId,
        phase: 'reporting',
        actor: 'zigrix',
        status: 'REPORTED',
        payload: { note: 'auto_report by finalize', requiredAgents: reqAgents },
      });
      steps.push({ step: 'reported', ok: true });
    }
  } else if (!complete) {
    steps.push({
      step: 'incomplete',
      missingAgents,
      missingUnits: unitSummary.missingUnits,
      missingWorkPackages: unitSummary.missingWorkPackages,
    });
  } else {
    // Complete but no auto-report
    task.status = 'DONE_PENDING_REPORT';
    saveTask(paths, task);
  }

  rebuildIndex(paths);

  const result: Record<string, unknown> = {
    ok: true,
    taskId: params.taskId,
    requiredAgents: reqAgents,
    complete,
    missingAgents,
    missingUnits: unitSummary.missingUnits,
    missingWorkPackages: unitSummary.missingWorkPackages,
    steps,
  };

  if (complete) {
    result.nextAction = 'sessions_send(sessionKey: "agent:main:main", message: "<taskId> 완료: <요약>")';
  }

  return result;
}
