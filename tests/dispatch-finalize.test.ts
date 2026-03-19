import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../src/config/defaults.js';
import { zigrixConfigSchema, type ZigrixConfig } from '../src/config/schema.js';
import { dispatchTask } from '../src/orchestration/dispatch.js';
import { collectEvidence } from '../src/orchestration/evidence.js';
import { finalizeTask } from '../src/orchestration/finalize.js';
import { renderReport } from '../src/orchestration/report.js';
import { completeWorker, registerWorker } from '../src/orchestration/worker.js';
import { resolvePaths } from '../src/state/paths.js';
import { loadTask, updateTaskStatus } from '../src/state/tasks.js';

function makeTempSetup() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-dispatch-'));
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
        'pro-zig': { label: 'pro-zig', role: 'orchestrator', runtime: 'openclaw', enabled: true, metadata: {} },
        'qa-zig': { label: 'qa-zig', role: 'qa', runtime: 'openclaw', enabled: true, metadata: {} },
        'front-zig': { label: 'front-zig', role: 'frontend', runtime: 'openclaw', enabled: true, metadata: {} },
        'back-zig': { label: 'back-zig', role: 'backend', runtime: 'openclaw', enabled: true, metadata: {} },
      },
      orchestration: {
        participants: ['pro-zig', 'qa-zig', 'front-zig', 'back-zig'],
        excluded: [],
        orchestratorId: 'pro-zig',
      },
    },
  });
  const paths = resolvePaths(cfg);
  return { paths, config: cfg };
}

describe('dispatch and finalize', () => {
  it('dispatches a task with meta.json, spec.md, and boot prompt', () => {
    const { paths, config } = makeTempSetup();
    const result = dispatchTask(paths, config, {
      title: 'Test dispatch',
      description: 'Verify dispatch flow',
      scale: 'simple',
      projectDir: '/tmp/test-project',
      requestedBy: 'test-user',
    }) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.taskId).toBeTruthy();
    expect(result.proZigPrompt).toBeTruthy();
    expect(String(result.proZigPrompt)).toContain('zigrix task start');
    expect(result.orchestratorId).toBe('pro-zig');
    expect(result.qaAgentId).toBe('qa-zig');

    const taskId = String(result.taskId);

    // Verify meta.json written
    const metaFile = path.join(paths.tasksDir, `${taskId}.meta.json`);
    expect(fs.existsSync(metaFile)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as Record<string, unknown>;
    expect(meta.projectDir).toBe('/tmp/test-project');
    expect(meta.requestedBy).toBe('test-user');
    expect(Array.isArray(meta.workPackages)).toBe(true);
    expect(Array.isArray(meta.executionUnits)).toBe(true);
    expect(meta.orchestratorId).toBe('pro-zig');
    expect(meta.qaAgentId).toBe('qa-zig');

    // Verify spec.md written
    const specFile = path.join(paths.tasksDir, `${taskId}.md`);
    expect(fs.existsSync(specFile)).toBe(true);
    const spec = fs.readFileSync(specFile, 'utf8');
    expect(spec).toContain('Task Spec');
    expect(spec).toContain(taskId);

    // Verify dispatch prompt written
    expect(fs.existsSync(String(result.promptPath))).toBe(true);
  });

  it('finalizes a complete task with auto-report', () => {
    const { paths, config } = makeTempSetup();
    const dispatched = dispatchTask(paths, config, {
      title: 'Finalize test',
      description: 'Test finalize',
      scale: 'simple',
    }) as Record<string, unknown>;
    const taskId = String(dispatched.taskId);

    // Simulate work
    updateTaskStatus(paths, taskId, 'IN_PROGRESS');
    registerWorker(paths, { taskId, agentId: 'pro-zig', sessionKey: 'agent:test:pro', runId: 'r1' });
    completeWorker(paths, { taskId, agentId: 'pro-zig', sessionKey: 'agent:test:pro', runId: 'r1' });
    collectEvidence(paths, { taskId, agentId: 'pro-zig', summary: 'orchestrated' });

    registerWorker(paths, { taskId, agentId: 'qa-zig', sessionKey: 'agent:test:qa', runId: 'r2' });
    completeWorker(paths, { taskId, agentId: 'qa-zig', sessionKey: 'agent:test:qa', runId: 'r2' });
    collectEvidence(paths, { taskId, agentId: 'qa-zig', summary: 'QA passed' });

    const result = finalizeTask(paths, { taskId, autoReport: true }) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.nextAction).toBeTruthy();

    const task = loadTask(paths, taskId);
    expect(task?.status).toBe('REPORTED');
  });

  it('detects incomplete finalize with missing agents', () => {
    const { paths, config } = makeTempSetup();
    const dispatched = dispatchTask(paths, config, {
      title: 'Incomplete test',
      description: 'Test incomplete finalize',
      scale: 'simple',
    }) as Record<string, unknown>;
    const taskId = String(dispatched.taskId);

    updateTaskStatus(paths, taskId, 'IN_PROGRESS');
    // Only pro-zig evidence, no qa-zig
    collectEvidence(paths, { taskId, agentId: 'pro-zig', summary: 'done' });

    const result = finalizeTask(paths, { taskId, autoReport: true }) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(false);
    expect((result.missingAgents as string[]).length).toBeGreaterThan(0);
  });

  it('uses configurable orchestratorId in execution units and QA completion checks', () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'zigrix-custom-orch-'));
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
          'custom-orch': { label: 'custom-orch', role: 'orchestrator', runtime: 'openclaw', enabled: true, metadata: {} },
          'custom-qa': { label: 'custom-qa', role: 'qa', runtime: 'openclaw', enabled: true, metadata: {} },
        },
        orchestration: {
          participants: ['custom-orch', 'custom-qa'],
          excluded: [],
          orchestratorId: 'custom-orch',
        },
      },
    });
    const paths = resolvePaths(cfg);

    const result = dispatchTask(paths, cfg, {
      title: 'Custom orchestrator test',
      description: 'Verify custom orchestratorId propagation',
      scale: 'simple',
    }) as Record<string, unknown>;

    expect(result.orchestratorId).toBe('custom-orch');
    expect(result.qaAgentId).toBe('custom-qa');
    expect(String(result.proZigPrompt)).toContain('custom-qa');

    const taskId = String(result.taskId);
    const metaFile = path.join(paths.tasksDir, `${taskId}.meta.json`);
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as Record<string, unknown>;
    expect(meta.orchestratorId).toBe('custom-orch');
    expect(meta.qaAgentId).toBe('custom-qa');

    const units = meta.executionUnits as Array<{ owner: string }>;
    const orchUnits = units.filter((u) => u.owner === 'custom-orch');
    const qaUnits = units.filter((u) => u.owner === 'custom-qa');
    expect(orchUnits.length).toBeGreaterThan(0);
    expect(qaUnits.length).toBeGreaterThan(0);

    // Verify dynamic QA evidence path (not hardcoded qa-zig)
    updateTaskStatus(paths, taskId, 'IN_PROGRESS');
    registerWorker(paths, { taskId, agentId: 'custom-orch', sessionKey: 'agent:test:custom-orch', runId: 'r1' });
    completeWorker(paths, { taskId, agentId: 'custom-orch', sessionKey: 'agent:test:custom-orch', runId: 'r1' });
    collectEvidence(paths, { taskId, agentId: 'custom-orch', summary: 'orchestrated' });

    registerWorker(paths, { taskId, agentId: 'custom-qa', sessionKey: 'agent:test:custom-qa', runId: 'r2' });
    completeWorker(paths, { taskId, agentId: 'custom-qa', sessionKey: 'agent:test:custom-qa', runId: 'r2' });
    collectEvidence(paths, { taskId, agentId: 'custom-qa', summary: 'QA passed' });

    const finalized = finalizeTask(paths, { taskId, autoReport: true }) as Record<string, unknown>;
    expect(finalized.complete).toBe(true);

    const reportPayload = renderReport(paths, { taskId, recordEvents: false }) as Record<string, unknown>;
    expect(String(reportPayload.report)).toContain('custom-qa evidence 존재');
  });
});
