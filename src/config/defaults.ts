import path from 'node:path';
import os from 'node:os';

export const ZIGRIX_HOME = process.env.ZIGRIX_HOME ?? path.join(os.homedir(), '.zigrix');

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
    projectsBaseDir: '',
  },
  agents: {
    registry: {},
    orchestration: {
      participants: [],
      excluded: [],
    },
  },
  rules: {
    scales: {
      simple: { requiredRoles: ['orchestrator'], optionalRoles: ['qa'] },
      normal: { requiredRoles: ['orchestrator', 'qa'], optionalRoles: ['frontend', 'backend'] },
      risky: { requiredRoles: ['orchestrator', 'qa', 'security'], optionalRoles: ['frontend', 'backend', 'infra'] },
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
      version: 1,
      placeholders: ['taskId', 'title', 'scale', 'agentId', 'description'],
      body: '## Worker Assignment: {{taskId}}\n- title: {{title}}\n- scale: {{scale}}\n- agent: {{agentId}}\n- description: {{description}}',
    },
    finalReport: {
      format: 'markdown',
      version: 1,
      placeholders: ['taskId', 'title', 'status', 'summary'],
      body: '## Final Report: {{taskId}}\n- title: {{title}}\n- status: {{status}}\n- summary: {{summary}}',
    },
  },
  runtime: {
    outputMode: 'text',
    jsonIndent: 2,
  },
} as const;

export type DefaultConfig = typeof defaultConfig;
