import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeBin = process.execPath;

describe('cli parity smoke', () => {
  it('supports onboard/task/evidence/report commands through built CLI', () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-cli-'));
    const env = { ...process.env, ZIGRIX_HOME: tmpBase };

    execFileSync(nodeBin, ['dist/index.js', 'onboard', '--yes'], { cwd: repoRoot, env });
    const createRaw = execFileSync(nodeBin, ['dist/index.js', 'task', 'create', '--title', 'CLI task', '--description', 'smoke', '--required-agent', 'qa-zig', '--json'], { cwd: repoRoot, encoding: 'utf8', env });
    const created = JSON.parse(createRaw) as { taskId: string };
    execFileSync(nodeBin, ['dist/index.js', 'evidence', 'collect', '--task-id', created.taskId, '--agent-id', 'qa-zig', '--summary', 'done'], { cwd: repoRoot, env });
    const mergedRaw = execFileSync(nodeBin, ['dist/index.js', 'evidence', 'merge', '--task-id', created.taskId, '--require-qa', '--json'], { cwd: repoRoot, encoding: 'utf8', env });
    const merged = JSON.parse(mergedRaw) as { complete: boolean };
    expect(merged.complete).toBe(true);
    const reportRaw = execFileSync(nodeBin, ['dist/index.js', 'report', 'render', '--task-id', created.taskId, '--json'], { cwd: repoRoot, encoding: 'utf8', env });
    const report = JSON.parse(reportRaw) as { report: string };
    expect(report.report).toContain('진행 요약');
  });
});
