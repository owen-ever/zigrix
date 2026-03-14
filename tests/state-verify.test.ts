import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { collectEvidence, mergeEvidence } from '../src/orchestration/evidence.js';
import { renderReport } from '../src/orchestration/report.js';
import { resolvePaths } from '../src/state/paths.js';
import { createTask, updateTaskStatus } from '../src/state/tasks.js';
import { verifyState } from '../src/state/verify.js';

describe('state verification', () => {
  it('passes for a consistent reported task', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-state-ok-'));
    const paths = resolvePaths(projectRoot, structuredClone(defaultConfig) as never);
    const task = createTask(paths, { title: 'ok', description: 'ok', requiredAgents: ['qa-zig'] });
    collectEvidence(paths, { taskId: task.taskId, agentId: 'qa-zig', summary: 'done' });
    mergeEvidence(paths, { taskId: task.taskId, requireQa: true });
    renderReport(paths, { taskId: task.taskId, recordEvents: true });
    updateTaskStatus(paths, task.taskId, 'REPORTED');

    const result = verifyState(paths);
    expect(result.ok).toBe(true);
  });

  it('fails when reported task has no merged evidence', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-state-bad-'));
    const paths = resolvePaths(projectRoot, structuredClone(defaultConfig) as never);
    const task = createTask(paths, { title: 'bad', description: 'bad', requiredAgents: ['qa-zig'] });
    updateTaskStatus(paths, task.taskId, 'REPORTED');

    const result = verifyState(paths) as { ok: boolean; failedCount: number; checks: Array<{ issues: string[] }> };
    expect(result.ok).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.checks[0]?.issues.join(' ')).toContain('merged evidence');
  });
});
