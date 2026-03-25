import path from 'node:path';

import { resolveDefaultWorkspaceBaseDir, resolveDefaultZigrixHome } from './path-utils.js';

export const ZIGRIX_HOME = resolveDefaultZigrixHome();

export const defaultConfig = {
  paths: {
    baseDir: ZIGRIX_HOME,
    tasksDir: path.join(ZIGRIX_HOME, 'tasks'),
    evidenceDir: path.join(ZIGRIX_HOME, 'evidence'),
    promptsDir: path.join(ZIGRIX_HOME, 'prompts'),
    eventsFile: path.join(ZIGRIX_HOME, 'tasks.jsonl'),
    indexFile: path.join(ZIGRIX_HOME, 'index.json'),
    runsDir: path.join(ZIGRIX_HOME, 'runs'),
    rulesDir: path.join(ZIGRIX_HOME, 'rules'),
  },
  workspace: {
    projectsBaseDir: resolveDefaultWorkspaceBaseDir(),
  },
  agents: {
    registry: {},
    orchestration: {
      participants: [],
      excluded: [],
      orchestratorId: 'auto',
    },
  },
  rules: {
    scales: {
      simple: { requiredRoles: ['orchestrator'], optionalRoles: ['qa'] },
      normal: { requiredRoles: ['orchestrator', 'qa'], optionalRoles: ['frontend', 'backend'] },
      risky: { requiredRoles: ['orchestrator', 'qa', 'security'], optionalRoles: ['frontend', 'backend', 'system'] },
    },
    completion: {
      requireQa: true,
      requireEvidence: true,
      requireUserReport: true,
    },
    stale: {
      defaultHours: 24,
    },
  },
  templates: {
    workerPrompt: {
      format: 'markdown',
      version: 2,
      placeholders: ['taskId', 'title', 'scale', 'agentId', 'description'],
      body: '## Worker Assignment: {{taskId}}\n- title: {{title}}\n- scale: {{scale}}\n- agent: {{agentId}}\n- description: {{description}}\n\n### Completion\n작업 완료 후 반드시 증적을 먼저 수집하라:\n```bash\nzigrix evidence collect --task-id {{taskId}} --agent-id {{agentId}} --summary "<결과 요약>"\n```\n⚠️ 증적 없이 완료하면 finalize에서 incomplete 판정된다.',
    },
    finalReport: {
      format: 'markdown',
      version: 1,
      placeholders: ['taskId', 'title', 'status', 'summary'],
      body: '## Final Report: {{taskId}}\n- title: {{title}}\n- status: {{status}}\n- summary: {{summary}}',
    },
  },
  openclaw: {
    home: '',
    binPath: null,
    gatewayUrl: 'http://127.0.0.1:18789',
  },
  runtime: {
    outputMode: 'text',
    jsonIndent: 2,
  },
} as const;

export type DefaultConfig = typeof defaultConfig;
