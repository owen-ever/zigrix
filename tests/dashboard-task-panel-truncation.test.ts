import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type TestHome = {
  zigrixHome: string;
  tasksDir: string;
  agentsDir: string;
};

function createHome(): TestHome {
  const zigrixHome = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-task-panel-truncation-'));
  const tasksDir = path.join(zigrixHome, 'tasks');
  const evidenceDir = path.join(zigrixHome, 'evidence');
  const agentsDir = path.join(zigrixHome, 'agents');

  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  fs.writeFileSync(
    path.join(zigrixHome, 'zigrix.config.json'),
    JSON.stringify({
      agents: {
        registry: {
          'orch-main': { label: 'orch-main', role: 'orchestrator' },
        },
      },
    }),
  );

  fs.writeFileSync(path.join(zigrixHome, 'index.json'), '{}');
  fs.writeFileSync(path.join(zigrixHome, 'tasks.jsonl'), '');

  return { zigrixHome, tasksDir, agentsDir };
}

function writeTaskMeta(tasksDir: string, taskId: string, meta: Record<string, unknown>) {
  fs.writeFileSync(
    path.join(tasksDir, `${taskId}.meta.json`),
    JSON.stringify({ taskId, ...meta }, null, 2) + '\n',
  );
}

function buildTaskEvents(taskId: string, count: number, startMs: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, idx) => {
    const ts = new Date(startMs + idx * 1_000).toISOString();
    return {
      ts,
      event: idx === 0 ? 'task_created' : 'worker_done',
      taskId,
      actor: idx === 0 ? 'orch-main' : 'backend-main',
      status: idx === count - 1 ? 'REPORTED' : 'IN_PROGRESS',
      payload: idx === 0 ? { title: `Task ${taskId}`, scale: 'normal' } : undefined,
    };
  });
}

function writeEvents(zigrixHome: string, events: Record<string, unknown>[]) {
  fs.writeFileSync(
    path.join(zigrixHome, 'tasks.jsonl'),
    events.map((event) => JSON.stringify(event)).join('\n') + '\n',
  );
}

describe('dashboard selected-task panel data should not be truncated to overview/local limits', () => {
  let home: TestHome;

  beforeEach(() => {
    home = createHome();
  });

  it('loadTaskDetail returns full events for an older task with 100+ events', async () => {
    const olderTaskId = 'DEV-OLD-100';
    const newerTaskId = 'DEV-NEW-RECENT';

    writeTaskMeta(home.tasksDir, olderTaskId, {
      title: 'Older long-history task',
      scale: 'normal',
      status: 'REPORTED',
    });
    writeTaskMeta(home.tasksDir, newerTaskId, {
      title: 'Newer task',
      scale: 'simple',
      status: 'IN_PROGRESS',
    });

    const olderEvents = buildTaskEvents(olderTaskId, 120, Date.parse('2026-01-01T00:00:00.000Z'));
    const newerEvents = buildTaskEvents(newerTaskId, 40, Date.parse('2026-02-01T00:00:00.000Z'));
    writeEvents(home.zigrixHome, [...olderEvents, ...newerEvents]);

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: home.zigrixHome,
      agentsStateDir: home.agentsDir,
      invokeTool: async () => ({ ok: true }),
    });

    const overview = store.loadOverview();
    expect(overview.recentEvents.length).toBe(30);
    expect(overview.recentEvents.some((event) => event.taskId === olderTaskId)).toBe(false);

    const detail = store.loadTaskDetail(olderTaskId);
    expect(detail.task.events.length).toBe(120);
    expect(detail.task.events[0]?.taskId).toBe(olderTaskId);
    expect(detail.task.events.at(-1)?.taskId).toBe(olderTaskId);
  });

  it('loadTaskConversation returns full task-specific recentEvents for an older task with 100+ events', async () => {
    const olderTaskId = 'DEV-OLD-101';
    const newerTaskId = 'DEV-NEW-101';

    writeTaskMeta(home.tasksDir, olderTaskId, {
      title: 'Older conversation history task',
      scale: 'normal',
      status: 'REPORTED',
    });
    writeTaskMeta(home.tasksDir, newerTaskId, {
      title: 'Newer conversation task',
      scale: 'simple',
      status: 'IN_PROGRESS',
    });

    const olderEvents = buildTaskEvents(olderTaskId, 120, Date.parse('2026-01-10T00:00:00.000Z'));
    const newerEvents = buildTaskEvents(newerTaskId, 40, Date.parse('2026-02-10T00:00:00.000Z'));
    writeEvents(home.zigrixHome, [...olderEvents, ...newerEvents]);

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: home.zigrixHome,
      agentsStateDir: home.agentsDir,
      invokeTool: async () => ({ ok: true }),
    });

    const overview = store.loadOverview();
    expect(overview.recentEvents.length).toBe(30);
    expect(overview.recentEvents.some((event) => event.taskId === olderTaskId)).toBe(false);

    const conversation = await store.loadTaskConversation(olderTaskId);
    expect(conversation.recentEvents.length).toBe(120);
    expect(conversation.recentEvents[0]?.event).toBe('worker_done');
    expect(conversation.recentEvents.at(-1)?.event).toBe('task_created');
    expect(conversation.recentEvents.every((event) => event.sessionKey === null)).toBe(true);
  });
});
