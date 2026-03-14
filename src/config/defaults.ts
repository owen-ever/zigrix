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
      body: '## Worker Assignment: {{taskId}}\n- scale: {{scale}}\n- description: {{description}}',
    },
    finalReport: {
      format: 'markdown',
      body: '## Final Report: {{taskId}}\n- status: {{status}}',
    },
  },
  runtime: {
    outputMode: 'text',
    jsonIndent: 2,
  },
} as const;

export type DefaultConfig = typeof defaultConfig;
