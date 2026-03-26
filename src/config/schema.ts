import { z } from 'zod';

import { STANDARD_AGENT_ROLES, normalizeAgentRole } from '../agents/roles.js';

const pathSchema = z.string().min(1);

const standardRoleSchema = z.enum(STANDARD_AGENT_ROLES);

const roleSchema = z.string().min(1).transform((value, ctx) => {
  const normalized = normalizeAgentRole(value);
  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `role must be one of: ${STANDARD_AGENT_ROLES.join(', ')}`,
    });
    return z.NEVER;
  }
  return normalized;
}).pipe(standardRoleSchema);

const agentSchema = z.object({
  label: z.string().min(1),
  role: roleSchema,
  runtime: z.string().min(1),
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const templateSchema = z.object({
  format: z.enum(['markdown', 'text']).default('markdown'),
  version: z.number().int().positive(),
  placeholders: z.array(z.string().min(1)).min(1),
  body: z.string().min(1),
});

export const zigrixConfigSchema = z.object({
  paths: z.object({
    baseDir: pathSchema,
    tasksDir: pathSchema,
    evidenceDir: pathSchema,
    promptsDir: pathSchema,
    eventsFile: pathSchema,
    indexFile: pathSchema,
    runsDir: pathSchema,
    rulesDir: pathSchema,
  }),
  workspace: z.object({
    projectsBaseDir: z.string().default(''),
  }),
  agents: z.object({
    registry: z.record(z.string(), agentSchema),
    orchestration: z.object({
      participants: z.array(z.string()),
      excluded: z.array(z.string()),
      orchestratorId: z.string().min(1),
    }),
  }).superRefine((value, ctx) => {
    const overlap = value.orchestration.participants.filter((item) => value.orchestration.excluded.includes(item));
    for (const agentId of overlap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `agent '${agentId}' cannot be both participant and excluded`,
        path: ['orchestration', 'excluded'],
      });
    }

    const knownAgents = new Set(Object.keys(value.registry));
    for (const agentId of value.orchestration.participants) {
      if (!knownAgents.has(agentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `participant '${agentId}' must exist in registry`,
          path: ['orchestration', 'participants'],
        });
      }
    }
    for (const agentId of value.orchestration.excluded) {
      if (!knownAgents.has(agentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `excluded agent '${agentId}' must exist in registry`,
          path: ['orchestration', 'excluded'],
        });
      }
    }

    // Only validate orchestratorId against registry when agents are registered
    // During bootstrap (addAgent one-by-one), registry may not yet include the orchestrator
    const orchestratorId = value.orchestration.orchestratorId;
    const hasOrchestratorInRegistry = knownAgents.has(orchestratorId);
    const hasAnyOrchestrator = Object.values(value.registry).some((agent) => agent.role === 'orchestrator');

    if (hasAnyOrchestrator && !hasOrchestratorInRegistry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `orchestratorId '${orchestratorId}' must exist in registry`,
        path: ['orchestration', 'orchestratorId'],
      });
    }

    if (value.orchestration.excluded.includes(orchestratorId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `orchestratorId '${orchestratorId}' cannot be excluded`,
        path: ['orchestration', 'orchestratorId'],
      });
    }
  }),
  rules: z.object({
    scales: z.record(z.string(), z.object({
      requiredRoles: z.array(roleSchema),
      optionalRoles: z.array(roleSchema),
    })),
    completion: z.object({
      requireQa: z.boolean(),
      requireEvidence: z.boolean(),
      requireUserReport: z.boolean(),
    }),
    stale: z.object({
      defaultHours: z.number().positive(),
    }),
  }),
  templates: z.object({
    workerPrompt: templateSchema,
    finalReport: templateSchema,
  }),
  openclaw: z.object({
    home: z.string().default(''),
    binPath: z.string().nullable().default(null),
    gatewayUrl: z.string().default(''),
  }).default({ home: '', binPath: null, gatewayUrl: '' }),
  runtime: z.object({
    outputMode: z.enum(['text', 'json']),
    jsonIndent: z.number().int().min(0).max(8),
  }),
});

export type ZigrixConfig = z.infer<typeof zigrixConfigSchema>;

export const zigrixConfigJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'ZigrixConfig',
  type: 'object',
  required: ['paths', 'workspace', 'agents', 'rules', 'templates', 'openclaw', 'runtime'],
  properties: {
    paths: {
      type: 'object',
      required: ['baseDir', 'tasksDir', 'evidenceDir', 'promptsDir', 'eventsFile', 'indexFile', 'runsDir', 'rulesDir'],
      properties: {
        baseDir: { type: 'string' },
        tasksDir: { type: 'string' },
        evidenceDir: { type: 'string' },
        promptsDir: { type: 'string' },
        eventsFile: { type: 'string' },
        indexFile: { type: 'string' },
        runsDir: { type: 'string' },
        rulesDir: { type: 'string' },
      },
      additionalProperties: false,
    },
    workspace: {
      type: 'object',
      properties: {
        projectsBaseDir: { type: 'string' },
      },
      additionalProperties: false,
    },
    agents: { type: 'object' },
    rules: { type: 'object' },
    templates: { type: 'object' },
    openclaw: {
      type: 'object',
      properties: {
        home: { type: 'string' },
        binPath: { type: ['string', 'null'] },
        gatewayUrl: { type: 'string' },
      },
      additionalProperties: false,
    },
    runtime: { type: 'object' },
  },
  additionalProperties: false,
} as const;
