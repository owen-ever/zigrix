export const defaultConfig = {
  paths: {
    stateDir: '.zigrix',
    tasksDir: '.zigrix/tasks',
    evidenceDir: '.zigrix/evidence',
    promptsDir: '.zigrix/prompts',
    eventsFile: '.zigrix/tasks.jsonl',
    indexFile: '.zigrix/index.json',
    runsDir: '.zigrix/runs',
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
