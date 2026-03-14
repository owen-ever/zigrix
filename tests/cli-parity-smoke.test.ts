import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('cli parity smoke', () => {
  it('supports init/task/evidence/report commands through built CLI', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-cli-'));
    const cwd = '/Users/janos/.openclaw/workspace/projects/zigrix';
    execFileSync('node', ['dist/index.js', 'init', '--yes', '--project-root', projectRoot], { cwd });
    const createRaw = execFileSync('node', ['dist/index.js', 'task', 'create', '--title', 'CLI task', '--description', 'smoke', '--required-agent', 'qa-zig', '--project-root', projectRoot, '--json'], { cwd, encoding: 'utf8' });
    const created = JSON.parse(createRaw) as { taskId: string };
    execFileSync('node', ['dist/index.js', 'evidence', 'collect', '--task-id', created.taskId, '--agent-id', 'qa-zig', '--summary', 'done', '--project-root', projectRoot], { cwd });
    const mergedRaw = execFileSync('node', ['dist/index.js', 'evidence', 'merge', '--task-id', created.taskId, '--require-qa', '--project-root', projectRoot, '--json'], { cwd, encoding: 'utf8' });
    const merged = JSON.parse(mergedRaw) as { complete: boolean };
    expect(merged.complete).toBe(true);
    const reportRaw = execFileSync('node', ['dist/index.js', 'report', 'render', '--task-id', created.taskId, '--project-root', projectRoot, '--json'], { cwd, encoding: 'utf8' });
    const report = JSON.parse(reportRaw) as { report: string };
    expect(report.report).toContain('진행 요약');
  });
});
