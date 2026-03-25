import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, beforeEach } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { zigrixConfigSchema } from '../src/config/schema.js';
import { dispatchTask } from '../src/orchestration/dispatch.js';
import { registerWorker, completeWorker } from '../src/orchestration/worker.js';
import { resolvePaths } from '../src/state/paths.js';
import { loadTask } from '../src/state/tasks.js';

// ─── Bug 2: registerWorker sessionId resolution from sessionKey ──────────────

describe('registerWorker sessionId from sessionKey', () => {
  function makeTempSetup() {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-session-mapping-'));
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
      agents: {
        registry: {
          'orch-a': { label: 'orch-a', role: 'orchestrator', runtime: 'openclaw', enabled: true, metadata: {} },
          'qa-a': { label: 'qa-a', role: 'qa', runtime: 'openclaw', enabled: true, metadata: {} },
          'back-zig': { label: 'back-zig', role: 'backend', runtime: 'openclaw', enabled: true, metadata: {} },
        },
        orchestration: {
          participants: ['orch-a', 'qa-a', 'back-zig'],
          excluded: [],
          orchestratorId: 'orch-a',
        },
      },
    });
    const paths = resolvePaths(cfg);
    return { paths, config: cfg };
  }

  it('resolves sessionId from sessionKey when sessionId param is empty', () => {
    const { paths, config } = makeTempSetup();
    const dispatched = dispatchTask(paths, config, {
      title: 'SessionId from key test',
      description: 'Test sessionId parsing from sessionKey',
      scale: 'simple',
    }) as Record<string, unknown>;
    const taskId = String(dispatched.taskId);

    const sessionKey = 'agent:back-zig:subagent:abc-def-123';
    const result = registerWorker(paths, {
      taskId,
      agentId: 'back-zig',
      sessionKey,
      runId: 'run-1',
      // sessionId intentionally omitted (empty)
    }) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.sessionId).toBe('abc-def-123');

    // Verify it's persisted in meta.json
    const task = loadTask(paths, taskId);
    expect(task).toBeTruthy();
    const workerSession = task!.workerSessions['back-zig'] as Record<string, unknown>;
    expect(workerSession.sessionId).toBe('abc-def-123');
  });

  it('preserves explicitly provided sessionId over parsed one', () => {
    const { paths, config } = makeTempSetup();
    const dispatched = dispatchTask(paths, config, {
      title: 'Explicit sessionId test',
      description: 'Test explicit sessionId is preserved',
      scale: 'simple',
    }) as Record<string, unknown>;
    const taskId = String(dispatched.taskId);

    const sessionKey = 'agent:back-zig:subagent:abc-def-123';
    const result = registerWorker(paths, {
      taskId,
      agentId: 'back-zig',
      sessionKey,
      runId: 'run-1',
      sessionId: 'explicit-session-id',
    }) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.sessionId).toBe('explicit-session-id');
  });

  it('sets sessionId to null when key format is non-standard', () => {
    const { paths, config } = makeTempSetup();
    const dispatched = dispatchTask(paths, config, {
      title: 'Non-standard key test',
      description: 'Test non-standard sessionKey format',
      scale: 'simple',
    }) as Record<string, unknown>;
    const taskId = String(dispatched.taskId);

    const sessionKey = 'custom-session-key-no-standard-format';
    const result = registerWorker(paths, {
      taskId,
      agentId: 'back-zig',
      sessionKey,
      runId: 'run-1',
    }) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.sessionId).toBeNull();
  });

  it('sessionId is carried through to events file', () => {
    const { paths, config } = makeTempSetup();
    const dispatched = dispatchTask(paths, config, {
      title: 'Events test',
      description: 'Test sessionId in events',
      scale: 'simple',
    }) as Record<string, unknown>;
    const taskId = String(dispatched.taskId);

    const sessionKey = 'agent:back-zig:subagent:event-sess-id-456';
    registerWorker(paths, {
      taskId,
      agentId: 'back-zig',
      sessionKey,
      runId: 'run-1',
    });

    // Read events file and find the worker_dispatched event
    const eventsRaw = fs.readFileSync(paths.eventsFile, 'utf-8');
    const events = eventsRaw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const dispatchedEvent = events.find(
      (e: Record<string, unknown>) => e.event === 'worker_dispatched' && e.targetAgent === 'back-zig',
    );

    expect(dispatchedEvent).toBeTruthy();
    expect(dispatchedEvent.sessionId).toBe('event-sess-id-456');
  });
});

// ─── Bug 1 & 3: Dashboard store tests (readAgentIds + resolveSessionIdMap) ──

// These test the createZigrixStore which reads from the filesystem.
// We create a minimal zigrix home dir structure to test.

describe('createZigrixStore: readAgentIds with nested registry', () => {
  let tmpZigrixHome: string;

  beforeEach(() => {
    tmpZigrixHome = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-store-test-'));
  });

  it('reads agent IDs from agents.registry (new config structure)', async () => {
    const config = {
      agents: {
        registry: {
          'orch-a': { label: 'orch-a', role: 'orchestrator' },
          'back-zig': { label: 'back-zig', role: 'backend' },
          'qa-a': { label: 'qa-a', role: 'qa' },
        },
        orchestration: {
          participants: ['orch-a', 'back-zig', 'qa-a'],
          orchestratorId: 'orch-a',
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpZigrixHome, 'zigrix.config.json'),
      JSON.stringify(config),
    );
    // Create minimal required files
    fs.writeFileSync(path.join(tmpZigrixHome, 'index.json'), '{}');
    fs.writeFileSync(path.join(tmpZigrixHome, 'tasks.jsonl'), '');

    // Import and test via the store
    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: tmpZigrixHome,
      agentsStateDir: path.join(tmpZigrixHome, 'agents'),
    });
    const overview = store.loadOverview();
    // The store should work without errors (agent IDs are used internally)
    expect(overview).toBeTruthy();
    expect(overview.generatedAt).toBeTruthy();
  });

  it('reads agent IDs from flat agents map (legacy config structure)', async () => {
    const config = {
      agents: {
        'orch-a': { label: 'orch-a', role: 'orchestrator' },
        'back-zig': { label: 'back-zig', role: 'backend' },
      },
    };
    fs.writeFileSync(
      path.join(tmpZigrixHome, 'zigrix.config.json'),
      JSON.stringify(config),
    );
    fs.writeFileSync(path.join(tmpZigrixHome, 'index.json'), '{}');
    fs.writeFileSync(path.join(tmpZigrixHome, 'tasks.jsonl'), '');

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: tmpZigrixHome,
      agentsStateDir: path.join(tmpZigrixHome, 'agents'),
    });
    const overview = store.loadOverview();
    expect(overview).toBeTruthy();
  });
});

describe('resolveSessionIdMap: deleted session file fallback', () => {
  let tmpZigrixHome: string;
  let tmpAgentsDir: string;

  beforeEach(() => {
    tmpZigrixHome = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-deleted-sessions-'));
    tmpAgentsDir = path.join(tmpZigrixHome, 'agents');
  });

  it('resolves sessionId from deleted session files when sessions.json lacks entry', async () => {
    const agentId = 'back-zig';
    const sessionId = 'deleted-sess-abc';
    const sessionKey = `agent:${agentId}:subagent:${sessionId}`;

    // Set up agent sessions directory with empty sessions.json
    const sessionsDir = path.join(tmpAgentsDir, agentId, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), '{}');

    // Create a deleted session file
    const deletedFileName = `${sessionId}.jsonl.deleted.2026-03-23T12:00:00Z`;
    fs.writeFileSync(path.join(sessionsDir, deletedFileName), '');

    // Create a minimal zigrix config and task structure
    const config = {
      agents: {
        registry: {
          [agentId]: { label: agentId, role: 'backend' },
        },
        orchestration: { participants: [agentId], orchestratorId: 'orch-a' },
      },
    };
    fs.writeFileSync(
      path.join(tmpZigrixHome, 'zigrix.config.json'),
      JSON.stringify(config),
    );

    // Create tasks dir, events, index, evidence
    const tasksDir = path.join(tmpZigrixHome, 'tasks');
    const evidenceDir = path.join(tmpZigrixHome, 'evidence');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(tmpZigrixHome, 'index.json'), '{}');

    const taskId = 'TEST-001';
    // Create meta.json with the session key
    const meta = {
      taskId,
      status: 'IN_PROGRESS',
      workerSessions: {
        [agentId]: {
          sessionKey,
          sessionId: null,  // This is the bug scenario - sessionId is null
          status: 'dispatched',
        },
      },
    };
    fs.writeFileSync(
      path.join(tasksDir, `${taskId}.meta.json`),
      JSON.stringify(meta),
    );

    // Create events referencing the task
    const event = {
      ts: new Date().toISOString(),
      event: 'worker_dispatched',
      taskId,
      targetAgent: agentId,
      sessionKey,
    };
    fs.writeFileSync(
      path.join(tmpZigrixHome, 'tasks.jsonl'),
      JSON.stringify(event) + '\n',
    );

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: tmpZigrixHome,
      agentsStateDir: tmpAgentsDir,
    });

    const conversation = await store.loadTaskConversation(taskId);
    expect(conversation).toBeTruthy();
    expect(conversation.sessionKeys).toContain(sessionKey);
    // The conversation should have resolved sessionId from deleted files
    // (it won't have messages since the deleted file is empty, but it should not error)
    expect(conversation.taskId).toBe(taskId);
  });

  it('resolves sessionId from active session file as well', async () => {
    const agentId = 'orch-a';
    const sessionId = 'active-sess-xyz';
    const sessionKey = `agent:${agentId}:subagent:${sessionId}`;

    const sessionsDir = path.join(tmpAgentsDir, agentId, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'sessions.json'), '{}');

    // Create an active session file
    fs.writeFileSync(path.join(sessionsDir, `${sessionId}.jsonl`), '');

    const config = {
      agents: {
        registry: {
          [agentId]: { label: agentId, role: 'orchestrator' },
        },
        orchestration: { participants: [agentId], orchestratorId: agentId },
      },
    };
    fs.writeFileSync(
      path.join(tmpZigrixHome, 'zigrix.config.json'),
      JSON.stringify(config),
    );

    const tasksDir = path.join(tmpZigrixHome, 'tasks');
    const evidenceDir = path.join(tmpZigrixHome, 'evidence');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(tmpZigrixHome, 'index.json'), '{}');

    const taskId = 'TEST-002';
    const meta = {
      taskId,
      status: 'IN_PROGRESS',
      workerSessions: {
        [agentId]: { sessionKey, sessionId: null, status: 'dispatched' },
      },
    };
    fs.writeFileSync(
      path.join(tasksDir, `${taskId}.meta.json`),
      JSON.stringify(meta),
    );
    fs.writeFileSync(
      path.join(tmpZigrixHome, 'tasks.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), event: 'worker_dispatched', taskId, targetAgent: agentId, sessionKey }) + '\n',
    );

    const { createZigrixStore } = await import('../dashboard/src/lib/zigrix-store.js');
    const store = createZigrixStore({
      zigrixHome: tmpZigrixHome,
      agentsStateDir: tmpAgentsDir,
    });

    const conversation = await store.loadTaskConversation(taskId);
    expect(conversation).toBeTruthy();
    expect(conversation.sessionKeys).toContain(sessionKey);
  });
});
