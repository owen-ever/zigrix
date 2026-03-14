import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { collectEvidence, mergeEvidence } from '../src/orchestration/evidence.js';
import { runPipeline } from '../src/orchestration/pipeline.js';
import { renderReport } from '../src/orchestration/report.js';
import { completeWorker, prepareWorker, registerWorker } from '../src/orchestration/worker.js';
import { resolvePaths } from '../src/state/paths.js';
import { createTask, listTaskEvents, loadTask, recordTaskProgress, updateTaskStatus } from '../src/state/tasks.js';

describe('task parity flow', () => {
  it('supports task -> worker -> evidence -> report flow', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-task-flow-'));
    const paths = resolvePaths(projectRoot, structuredClone(defaultConfig) as never);

    const task = createTask(paths, {
      title: 'Parity task',
      description: 'Check TS parity flow',
      scale: 'normal',
      requiredAgents: ['qa-zig'],
    });
    updateTaskStatus(paths, task.taskId, 'IN_PROGRESS');
    const progress = recordTaskProgress(paths, { taskId: task.taskId, actor: 'zigrix', message: 'kickoff' });
    expect(progress?.event).toBe('progress_report');

    const prepared = prepareWorker(paths, { taskId: task.taskId, agentId: 'qa-zig', description: 'Run QA' });
    expect(prepared?.ok).toBe(true);
    const registered = registerWorker(paths, { taskId: task.taskId, agentId: 'qa-zig', sessionKey: 'agent:test:qa', runId: 'run-001' });
    expect(registered?.status).toBe('dispatched');
    const completed = completeWorker(paths, { taskId: task.taskId, agentId: 'qa-zig', sessionKey: 'agent:test:qa', runId: 'run-001' });
    expect(completed?.allEvidenceCollected).toBe(false);

    const evidence = collectEvidence(paths, { taskId: task.taskId, agentId: 'qa-zig', summary: 'QA passed' });
    expect(evidence?.ok).toBe(true);
    const merged = mergeEvidence(paths, { taskId: task.taskId, requireQa: true });
    expect(merged?.complete).toBe(true);

    const report = renderReport(paths, { taskId: task.taskId, recordEvents: true });
    expect(String(report?.report)).toContain('QA 결과');
    expect(loadTask(paths, task.taskId)?.status).toBe('IN_PROGRESS');

    const events = listTaskEvents(paths, task.taskId);
    expect(events.length).toBeGreaterThan(0);
  });

  it('runs pipeline with evidence summaries and auto-report', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-pipeline-'));
    const paths = resolvePaths(projectRoot, structuredClone(defaultConfig) as never);
    const result = runPipeline(paths, {
      title: 'Pipeline task',
      description: 'Pipeline test',
      requiredAgents: ['qa-zig'],
      evidenceSummaries: ['qa-zig=Looks good'],
      requireQa: true,
      autoReport: true,
      recordFeedback: true,
    });
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(true);
  });
});
