import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { zigrixConfigSchema } from '../src/config/schema.js';
import { collectEvidence, mergeEvidence } from '../src/orchestration/evidence.js';
import { renderReport } from '../src/orchestration/report.js';
import { resolvePaths } from '../src/state/paths.js';
import { createTask, updateTaskStatus } from '../src/state/tasks.js';
import { verifyState } from '../src/state/verify.js';

function makeTempPaths() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-state-'));
  const cfg = zigrixConfigSchema.parse({
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
  return resolvePaths(cfg);
}

describe('state verification', () => {
  it('passes for a consistent reported task', () => {
    const paths = makeTempPaths();
    const task = createTask(paths, { title: 'ok', description: 'ok', requiredAgents: ['qa-a'] });
    collectEvidence(paths, { taskId: task.taskId, agentId: 'qa-a', summary: 'done' });
    mergeEvidence(paths, { taskId: task.taskId, requireQa: true });
    renderReport(paths, { taskId: task.taskId, recordEvents: true });
    updateTaskStatus(paths, task.taskId, 'REPORTED');

    const result = verifyState(paths);
    expect(result.ok).toBe(true);
  });

  it('fails when reported task has no merged evidence', () => {
    const paths = makeTempPaths();
    const task = createTask(paths, { title: 'bad', description: 'bad', requiredAgents: ['qa-a'] });
    updateTaskStatus(paths, task.taskId, 'REPORTED');

    const result = verifyState(paths) as { ok: boolean; failedCount: number; checks: Array<{ issues: string[] }> };
    expect(result.ok).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.checks[0]?.issues.join(' ')).toContain('merged evidence');
  });
});
