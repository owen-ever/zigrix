import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function createHome() {
  const zigrixHome = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-dashboard-conversation-'));
  const tasksDir = path.join(zigrixHome, 'tasks');
  const evidenceDir = path.join(zigrixHome, 'evidence');
  const agentsDir = path.join(zigrixHome, 'agents');

  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  const config = {
    agents: {
      registry: {
        'orch-main': { label: 'orch-main', role: 'orchestrator' },
        'backend-main': { label: 'backend-main', role: 'backend' },
      },
      orchestration: {
        participants: ['orch-main', 'backend-main'],
        orchestratorId: 'orch-main',
      },
    },
  };

  fs.writeFileSync(path.join(zigrixHome, 'zigrix.config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(zigrixHome, 'index.json'), '{}');
  fs.writeFileSync(path.join(zigrixHome, 'tasks.jsonl'), '');

  return { zigrixHome, tasksDir, evidenceDir, agentsDir };
}

function writeTaskMeta(tasksDir: string, taskId: string, meta: Record<string, unknown>) {
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

function makeMessage(timestamp: number, text: string) {
  return {
    type: 'message',
    timestamp,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
  };
}

describe('dashboard conversation history ordering', () => {
  let home: ReturnType<typeof createHome>;

  beforeEach(() => {
    home = createHome();
  });

  it('prefers full local session history over partial gateway history for ordering', async () => {
    const taskId = 'DEV-CONV-001';
    const orchestratorSessionId = 'orch-session-1';
    const backendSessionId = 'backend-session-1';
    const orchestratorSessionKey = `agent:orch-main:subagent:${orchestratorSessionId}`;
    const backendSessionKey = `agent:backend-main:subagent:${backendSessionId}`;

    writeDeletedSession(home.agentsDir, 'orch-main', orchestratorSessionId, '2026-04-11T05:00:00Z', [
      makeMessage(1000, 'orch earliest'),
      makeMessage(1100, 'orch planning'),
    ]);
    writeDeletedSession(home.agentsDir, 'backend-main', backendSessionId, '2026-04-11T05:10:00Z', [
      makeMessage(2000, 'backend start'),
    ]);

    writeTaskMeta(home.tasksDir, taskId, {
      title: 'Conversation ordering task',
      scale: 'normal',
      status: 'REPORTED',
      orchestratorId: 'orch-main',
      orchestratorSessionKey,
      workerSessions: {
        'backend-main': {
          sessionKey: backendSessionKey,
          status: 'done',
        },
      },
    });

    writeEvents(home.zigrixHome, [
      {
        ts: '2026-04-11T05:00:00.000Z',
        event: 'task_created',
        taskId,
        actor: 'orch-main',
        payload: { title: 'Conversation ordering task', scale: 'normal' },
      },
      {
        ts: '2026-04-11T05:10:00.000Z',
        event: 'worker_done',
        taskId,
        actor: 'backend-main',
        sessionKey: backendSessionKey,
        targetAgent: 'backend-main',
      },
    ]);

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: home.zigrixHome,
      agentsStateDir: home.agentsDir,
      invokeTool: async (_tool, args) => {
        if (String(args.sessionKey || '') === orchestratorSessionKey) {
          return {
            messages: [
              {
                role: 'assistant',
                timestamp: 9999,
                content: [{ type: 'text', text: 'orch recent tail only' }],
              },
            ],
          };
        }
        throw new Error('gateway unavailable');
      },
    });

    const conversation = await store.loadTaskConversation(taskId);

    expect(conversation.stream).toHaveLength(3);
    expect(conversation.stream[0]?.sessionKey).toBe(orchestratorSessionKey);
    expect(conversation.stream[0]?.timestamp).toBe(1000);
    expect(conversation.stream[1]?.timestamp).toBe(1100);
    expect(conversation.stream[2]?.sessionKey).toBe(backendSessionKey);
  });

  it('does not hard-truncate selected-task conversation to 200 messages when local history is available', async () => {
    const taskId = 'DEV-CONV-002';
    const orchestratorSessionId = 'orch-session-200';
    const orchestratorSessionKey = `agent:orch-main:subagent:${orchestratorSessionId}`;

    const lines = Array.from({ length: 240 }, (_, index) =>
      makeMessage(index + 1, `orch message ${index + 1}`),
    );
    writeDeletedSession(home.agentsDir, 'orch-main', orchestratorSessionId, '2026-04-11T06:00:00Z', lines);

    writeTaskMeta(home.tasksDir, taskId, {
      title: 'Long conversation task',
      scale: 'normal',
      status: 'REPORTED',
      orchestratorId: 'orch-main',
      orchestratorSessionKey,
    });

    writeEvents(home.zigrixHome, [
      {
        ts: '2026-04-11T06:00:00.000Z',
        event: 'task_created',
        taskId,
        actor: 'orch-main',
        payload: { title: 'Long conversation task', scale: 'normal' },
      },
    ]);

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: home.zigrixHome,
      agentsStateDir: home.agentsDir,
      sessionsHistoryLimit: 200,
      invokeTool: async () => ({
        messages: Array.from({ length: 20 }, (_, index) => ({
          role: 'assistant',
          timestamp: 10000 + index,
          content: [{ type: 'text', text: `gateway tail ${index + 1}` }],
        })),
      }),
    });

    const conversation = await store.loadTaskConversation(taskId);

    expect(conversation.stream).toHaveLength(240);
    expect(conversation.stream[0]?.timestamp).toBe(1);
    expect(conversation.stream.at(-1)?.timestamp).toBe(240);
  });
});
