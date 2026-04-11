import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { zigrixConfigSchema } from '../src/config/schema.js';
import { collectEvidence, mergeEvidence } from '../src/orchestration/evidence.js';
import { runPipeline } from '../src/orchestration/pipeline.js';
import { renderReport } from '../src/orchestration/report.js';
import { completeWorker, prepareWorker, registerWorker } from '../src/orchestration/worker.js';
import { resolvePaths } from '../src/state/paths.js';
import { createTask, listTaskEvents, loadTask, recordTaskProgress, updateTaskStatus } from '../src/state/tasks.js';

function makeTempSetup() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-task-flow-'));
  const config = zigrixConfigSchema.parse({
    ...structuredClone(defaultConfig),
    paths: {
      baseDir: tmpBase,
      tasksDir: path.join(tmpBase, 'tasks'),
      evidenceDir: path.join(tmpBase, 'evidence'),
      promptsDir: path.join(tmpBase, 'prompts'),
      eventsFile: path.join(tmpBase, 'tasks.jsonl'),
      indexFile: path.join(tmpBase, 'index.json'),
      runsDir: path.join(tmpBase, 'runs'),
      rulesDir: path.join(tmpBase, 'rules'),
    },
  });
  const paths = resolvePaths(config);
  return { paths, config };
}

describe('task parity flow', () => {
  it('supports task -> worker -> evidence -> report flow', () => {
    const { paths, config } = makeTempSetup();

    const task = createTask(paths, {
      title: 'Parity task',
      description: 'Check TS parity flow',
      scale: 'normal',
      requiredAgents: ['qa-main'],
    });
    updateTaskStatus(paths, task.taskId, 'IN_PROGRESS');
    const progress = recordTaskProgress(paths, { taskId: task.taskId, actor: 'zigrix', message: 'kickoff' });
    expect(progress?.event).toBe('progress_report');

    const prepared = prepareWorker(paths, config, {
      taskId: task.taskId,
      agentId: 'qa-main',
      description: 'Run QA',
    });
    expect(prepared?.ok).toBe(true);
    const registered = registerWorker(paths, {
      taskId: task.taskId,
      agentId: 'qa-main',
      sessionKey: 'agent:qa-main:subagent:qa-run-001',
      runId: 'run-001',
      label: `[qa-main] ${task.taskId}`,
    });
    expect(registered?.status).toBe('dispatched');
    const completed = completeWorker(paths, {
      taskId: task.taskId,
      agentId: 'qa-main',
      sessionKey: 'agent:qa-main:subagent:qa-run-001',
      runId: 'run-001',
    });
    expect(completed?.allEvidenceCollected).toBe(false);

    const evidence = collectEvidence(paths, {
      taskId: task.taskId,
      agentId: 'qa-main',
      summary: 'QA passed',
      verificationMappings: [{ dod: 'qa evidence attached', test: 'tests/task-flow.test.ts parity flow' }],
    });
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
    const { paths } = makeTempSetup();
    const result = runPipeline(paths, {
      title: 'Pipeline task',
      description: 'Pipeline test',
      requiredAgents: ['qa-main'],
      evidenceSummaries: ['qa-main=Looks good'],
      verificationMappings: ['qa-main=qa evidence attached=tests/task-flow.test.ts pipeline'],
      requireQa: true,
      autoReport: true,
      recordFeedback: true,
    });
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(true);
  });
});
