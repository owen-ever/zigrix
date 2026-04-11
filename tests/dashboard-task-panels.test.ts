import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  bindSelectedTaskConversation,
  bindSelectedTaskDetail,
  bindSelectedTaskEvents,
} from '../dashboard/src/lib/task-panel.js';
import { resolveZigrixVersion } from '../dashboard/src/lib/zigrix-version.js';

const taskADetail = {
  task: {
    taskId: 'TASK-A',
    events: [{ ts: '2026-04-11T00:00:00.000Z', event: 'worker_done', taskId: 'TASK-A' }],
  },
} as any;

const taskAConversation = {
  taskId: 'TASK-A',
  stream: [],
} as any;

describe('dashboard selected-task panel bindings', () => {
  it('returns empty bindings when no task is selected', () => {
    expect(bindSelectedTaskDetail(null, taskADetail)).toBeNull();
    expect(bindSelectedTaskConversation(null, taskAConversation)).toBeNull();
    expect(bindSelectedTaskEvents(null, taskADetail)).toEqual([]);
  });

  it('rejects stale panel data from a different task', () => {
    expect(bindSelectedTaskDetail('TASK-B', taskADetail)).toBeNull();
    expect(bindSelectedTaskConversation('TASK-B', taskAConversation)).toBeNull();
    expect(bindSelectedTaskEvents('TASK-B', taskADetail)).toEqual([]);
  });

  it('binds detail/conversation/events only for the selected task id', () => {
    expect(bindSelectedTaskDetail('TASK-A', taskADetail)).toBe(taskADetail);
    expect(bindSelectedTaskConversation('TASK-A', taskAConversation)).toBe(taskAConversation);
    expect(bindSelectedTaskEvents('TASK-A', taskADetail)).toEqual(taskADetail.task.events);
  });
});

describe('resolveZigrixVersion', () => {
  it('reads zigrix version from ancestor package.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-version-'));
    const repoDir = path.join(root, 'repo');
    const runtimeDir = path.join(repoDir, 'dist', 'dashboard');

    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, 'package.json'),
      JSON.stringify({ name: 'zigrix', version: '9.9.9' }),
    );

    expect(resolveZigrixVersion(runtimeDir, 'fallback')).toBe('9.9.9');
  });

  it('returns fallback version when zigrix package.json is unavailable', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-version-fallback-'));
    const runtimeDir = path.join(root, 'runtime');

    fs.mkdirSync(runtimeDir, { recursive: true });

    expect(resolveZigrixVersion(runtimeDir, 'fallback-version')).toBe('fallback-version');
  });
});
