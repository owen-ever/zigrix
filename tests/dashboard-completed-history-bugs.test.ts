import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function createHome() {
  const zigrixHome = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-dashboard-history-'));
  const tasksDir = path.join(zigrixHome, 'tasks');
  const evidenceDir = path.join(zigrixHome, 'evidence');
  const agentsDir = path.join(zigrixHome, 'agents');

  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  const config = {
    agents: {
      registry: {
        'pro-zig': { label: 'pro-zig', role: 'orchestrator' },
        'back-zig': { label: 'back-zig', role: 'backend' },
        'qa-zig': { label: 'qa-zig', role: 'qa' },
      },
      orchestration: {
        participants: ['pro-zig', 'back-zig', 'qa-zig'],
        orchestratorId: 'pro-zig',
      },
    },
  };

  fs.writeFileSync(path.join(zigrixHome, 'zigrix.config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(zigrixHome, 'index.json'), '{}');
  fs.writeFileSync(path.join(zigrixHome, 'tasks.jsonl'), '');

  return { zigrixHome, tasksDir, evidenceDir, agentsDir };
}

function writeTaskMeta(
  tasksDir: string,
  taskId: string,
  meta: Record<string, unknown>,
) {
  fs.writeFileSync(
    path.join(tasksDir, `${taskId}.meta.json`),
    JSON.stringify({ taskId, ...meta }, null, 2) + '\n',
  );
}

function writeEvents(zigrixHome: string, events: Record<string, unknown>[]) {
  fs.writeFileSync(
    path.join(zigrixHome, 'tasks.jsonl'),
    events.map((event) => JSON.stringify(event)).join('\n') + '\n',
  );
}

function writeDeletedSession(
  agentsDir: string,
  agentId: string,
  sessionId: string,
  fileSuffix: string,
  lines: Record<string, unknown>[],
) {
  const sessionsDir = path.join(agentsDir, agentId, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), '{}');

  const deletedPath = path.join(sessionsDir, `${sessionId}.jsonl.deleted.${fileSuffix}`);
  fs.writeFileSync(deletedPath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
  return deletedPath;
}

describe('dashboard completed-task behavior regressions', () => {
  let home: ReturnType<typeof createHome>;

  beforeEach(() => {
    home = createHome();
  });

  it('loads completed task conversation from deleted session files and exposes deleted paths', async () => {
    const taskId = 'DEV-TEST-001';
    const sessionId = 'deleted-session-1';
    const sessionKey = `agent:back-zig:subagent:${sessionId}`;

    const deletedPath = writeDeletedSession(home.agentsDir, 'back-zig', sessionId, '2026-03-25T01:00:00Z', [
      {
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'completed report from deleted file' }],
        },
      },
    ]);

    writeTaskMeta(home.tasksDir, taskId, {
      title: 'Completed task with deleted session',
      scale: 'normal',
      status: 'REPORTED',
      workerSessions: {
        'back-zig': {
          sessionKey,
          sessionId: null,
          status: 'done',
        },
      },
    });

    writeEvents(home.zigrixHome, [
      {
        ts: '2026-03-25T01:00:00.000Z',
        event: 'task_created',
        taskId,
        actor: 'pro-zig',
        payload: { title: 'Completed task with deleted session', scale: 'normal' },
      },
      {
        ts: '2026-03-25T01:30:00.000Z',
        event: 'reported',
        taskId,
        actor: 'pro-zig',
      },
    ]);

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: home.zigrixHome,
      agentsStateDir: home.agentsDir,
      invokeTool: async () => {
        throw new Error('gateway unavailable');
      },
    });

    const conversation = await store.loadTaskConversation(taskId);
    const filePaths = store.getTaskSessionFilePaths(taskId);

    expect(conversation.openclawAvailable).toBe(true);
    expect(conversation.stream.length).toBeGreaterThan(0);
    expect(conversation.stream[0]?.sessionKey).toBe(sessionKey);
    expect(filePaths).toContain(deletedPath);
  });

  it('propagates completed task title from history/meta into dashboard list mapping', async () => {
    const taskId = 'DEV-TEST-002';

    writeTaskMeta(home.tasksDir, taskId, {
      title: 'Durable completed title',
      scale: 'simple',
      status: 'REPORTED',
    });

    writeEvents(home.zigrixHome, [
      {
        ts: '2026-03-25T02:00:00.000Z',
        event: 'task_created',
        taskId,
        actor: 'pro-zig',
        payload: { title: 'Ephemeral title', scale: 'simple' },
      },
      {
        ts: '2026-03-25T02:30:00.000Z',
        event: 'reported',
        taskId,
        actor: 'pro-zig',
      },
    ]);

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const { buildTaskListItems } = await import('../dashboard/src/lib/task-list.js');

    const store = createZigrixStore({
      zigrixHome: home.zigrixHome,
      agentsStateDir: home.agentsDir,
      invokeTool: async () => ({ ok: true }),
    });

    const overview = store.loadOverview();
    const historyRow = overview.taskHistory.find((row) => row.taskId === taskId);
    const mappedRow = buildTaskListItems(overview).find((row) => row.taskId === taskId);

    expect(historyRow?.status).toBe('REPORTED');
    expect(historyRow?.title).toBe('Durable completed title');
    expect(mappedRow?.title).toBe('Durable completed title');
  });

  it('propagates completed task scale from meta/task_created into history and list mapping', async () => {
    const taskId = 'DEV-TEST-003';

    writeTaskMeta(home.tasksDir, taskId, {
      title: 'Scale fallback task',
      scale: 'large',
      status: 'REPORTED',
    });

    writeEvents(home.zigrixHome, [
      {
        ts: '2026-03-25T03:00:00.000Z',
        event: 'task_created',
        taskId,
        actor: 'pro-zig',
        payload: { title: 'Scale fallback task', scale: 'large' },
      },
      {
        ts: '2026-03-25T03:10:00.000Z',
        event: 'worker_done',
        taskId,
        actor: 'back-zig',
      },
      {
        ts: '2026-03-25T03:20:00.000Z',
        event: 'reported',
        taskId,
        actor: 'pro-zig',
      },
    ]);

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const { buildTaskListItems } = await import('../dashboard/src/lib/task-list.js');

    const store = createZigrixStore({
      zigrixHome: home.zigrixHome,
      agentsStateDir: home.agentsDir,
      invokeTool: async () => ({ ok: true }),
    });

    const overview = store.loadOverview();
    const historyRow = overview.taskHistory.find((row) => row.taskId === taskId);
    const mappedRow = buildTaskListItems(overview).find((row) => row.taskId === taskId);

    expect(historyRow?.status).toBe('REPORTED');
    expect(historyRow?.scale).toBe('large');
    expect(mappedRow?.scale).toBe('large');
  });

  it('keeps conversation available when gateway fails but at least one local fallback succeeds', async () => {
    const taskId = 'DEV-TEST-004';
    const fallbackSessionId = 'fallback-session';
    const missingSessionId = 'missing-session';
    const fallbackSessionKey = `agent:back-zig:subagent:${fallbackSessionId}`;
    const missingSessionKey = `agent:qa-zig:subagent:${missingSessionId}`;

    writeDeletedSession(home.agentsDir, 'back-zig', fallbackSessionId, '2026-03-25T04:00:00Z', [
      {
        type: 'message',
        timestamp: 2,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'fallback content survives gateway failure' }],
        },
      },
    ]);

    const qaSessionsDir = path.join(home.agentsDir, 'qa-zig', 'sessions');
    fs.mkdirSync(qaSessionsDir, { recursive: true });
    fs.writeFileSync(path.join(qaSessionsDir, 'sessions.json'), '{}');

    writeTaskMeta(home.tasksDir, taskId, {
      title: 'Mixed fallback task',
      scale: 'normal',
      status: 'REPORTED',
      workerSessions: {
        'back-zig': { sessionKey: fallbackSessionKey, sessionId: null, status: 'done' },
        'qa-zig': { sessionKey: missingSessionKey, sessionId: null, status: 'done' },
      },
    });

    writeEvents(home.zigrixHome, [
      {
        ts: '2026-03-25T04:00:00.000Z',
        event: 'task_created',
        taskId,
        actor: 'pro-zig',
        payload: { title: 'Mixed fallback task', scale: 'normal' },
      },
      {
        ts: '2026-03-25T04:20:00.000Z',
        event: 'reported',
        taskId,
        actor: 'pro-zig',
      },
    ]);

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: home.zigrixHome,
      agentsStateDir: home.agentsDir,
      invokeTool: async (_tool, args) => {
        const key = String(args.sessionKey || '');
        if (key === missingSessionKey) {
          await sleep(30);
        }
        throw new Error(`gateway unavailable for ${key}`);
      },
    });

    const conversation = await store.loadTaskConversation(taskId);
    const fallbackSession = conversation.sessions.find((session) => session.sessionKey === fallbackSessionKey);
    const missingSession = conversation.sessions.find((session) => session.sessionKey === missingSessionKey);

    expect(fallbackSession?.ok).toBe(true);
    expect(missingSession?.ok).toBe(false);
    expect(conversation.stream.length).toBeGreaterThan(0);
    expect(conversation.openclawAvailable).toBe(true);
  });
});
