import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('cancelTask: meta.json status sync', () => {
  let tmpZigrixHome: string;
  let specsDir: string;
  let eventsPath: string;

  beforeEach(() => {
    tmpZigrixHome = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-cancel-sync-'));
    specsDir = path.join(tmpZigrixHome, 'tasks');
    eventsPath = path.join(tmpZigrixHome, 'tasks.jsonl');

    // Create required directories
    fs.mkdirSync(specsDir, { recursive: true });
    fs.mkdirSync(path.join(tmpZigrixHome, 'evidence'), { recursive: true });
    fs.mkdirSync(path.join(tmpZigrixHome, 'agents'), { recursive: true });

    // Write minimal config
    const config = {
      agents: {
        registry: {
          'orch-a': { label: 'orch-a', role: 'orchestrator' },
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpZigrixHome, 'zigrix.config.json'),
      JSON.stringify(config),
    );
    fs.writeFileSync(path.join(tmpZigrixHome, 'index.json'), '{}');
  });

  it('updates meta.json status to BLOCKED after cancelTask', async () => {
    const taskId = 'TEST-001';

    // Create meta.json with IN_PROGRESS status
    const metaPath = path.join(specsDir, `${taskId}.meta.json`);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        taskId,
        title: 'Test task',
        status: 'IN_PROGRESS',
        createdAt: new Date().toISOString(),
      }, null, 2) + '\n',
    );

    // Write task_created + task_started events to tasks.jsonl
    const events = [
      {
        ts: new Date().toISOString(),
        event: 'task_created',
        taskId,
        phase: 'planning',
        status: 'OPEN',
        actor: 'orch-a',
        payload: { title: 'Test task' },
      },
      {
        ts: new Date().toISOString(),
        event: 'task_started',
        taskId,
        phase: 'execution',
        status: 'IN_PROGRESS',
        actor: 'back-zig',
        payload: {},
      },
    ];
    fs.writeFileSync(
      eventsPath,
      events.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );

    // Import store and create with mock invokeTool
    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: tmpZigrixHome,
      agentsStateDir: path.join(tmpZigrixHome, 'agents'),
      invokeTool: async () => ({ ok: true }),
    });

    // Cancel the task
    const result = await store.cancelTask(taskId);
    expect(result.ok).toBe(true);

    // Verify meta.json status is BLOCKED
    const updatedMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    expect(updatedMeta.status).toBe('BLOCKED');
    expect(updatedMeta.updatedAt).toBeTruthy();

    // Verify tasks.jsonl has blocked event
    const allEvents = fs
      .readFileSync(eventsPath, 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const blockedEvents = allEvents.filter(
      (e) => e.event === 'blocked' && e.taskId === taskId,
    );
    expect(blockedEvents.length).toBe(1);
    expect(blockedEvents[0].status).toBe('BLOCKED');
    expect(blockedEvents[0].payload.reason).toBe('user_cancelled');
  });

  it('loadTaskDetail returns BLOCKED status after cancelTask', async () => {
    const taskId = 'TEST-002';

    // Create meta.json with IN_PROGRESS status
    const metaPath = path.join(specsDir, `${taskId}.meta.json`);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        taskId,
        title: 'Test task 2',
        status: 'IN_PROGRESS',
        createdAt: new Date().toISOString(),
      }, null, 2) + '\n',
    );

    // Write events
    const events = [
      {
        ts: new Date().toISOString(),
        event: 'task_created',
        taskId,
        phase: 'planning',
        status: 'OPEN',
        actor: 'orch-a',
        payload: { title: 'Test task 2' },
      },
      {
        ts: new Date().toISOString(),
        event: 'task_started',
        taskId,
        phase: 'execution',
        status: 'IN_PROGRESS',
        actor: 'back-zig',
        payload: {},
      },
    ];
    fs.writeFileSync(
      eventsPath,
      events.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: tmpZigrixHome,
      agentsStateDir: path.join(tmpZigrixHome, 'agents'),
      invokeTool: async () => ({ ok: true }),
    });

    // Cancel
    await store.cancelTask(taskId);

    // loadTaskDetail should show BLOCKED status (resolveTaskStatus reads meta.json)
    const detail = store.loadTaskDetail(taskId);
    expect(detail.task.status).toBe('BLOCKED');
  });
});
