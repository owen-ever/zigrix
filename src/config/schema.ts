import { z } from 'zod';

const roleSchema = z.string().min(1);

const pathSchema = z.string().min(1);

const agentSchema = z.object({
  label: z.string().min(1),
  role: z.string().min(1),
  runtime: z.string().min(1),
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const templateSchema = z.object({
  format: z.enum(['markdown', 'text']).default('markdown'),
  body: z.string().min(1),
});

export const zigrixConfigSchema = z.object({
  paths: z.object({
    stateDir: pathSchema,
    tasksDir: pathSchema,
    evidenceDir: pathSchema,
    promptsDir: pathSchema,
    eventsFile: pathSchema,
    indexFile: pathSchema,
    runsDir: pathSchema,
  }),
  agents: z.object({
    registry: z.record(z.string(), agentSchema),
    orchestration: z.object({
      participants: z.array(z.string()),
      excluded: z.array(z.string()),
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
  required: ['paths', 'agents', 'rules', 'templates', 'runtime'],
  properties: {
    paths: {
      type: 'object',
      required: ['stateDir', 'tasksDir', 'evidenceDir', 'promptsDir', 'eventsFile', 'indexFile', 'runsDir'],
      properties: {
        stateDir: { type: 'string' },
        tasksDir: { type: 'string' },
        evidenceDir: { type: 'string' },
        promptsDir: { type: 'string' },
        eventsFile: { type: 'string' },
        indexFile: { type: 'string' },
        runsDir: { type: 'string' },
      },
      additionalProperties: false,
    },
    agents: { type: 'object' },
    rules: { type: 'object' },
    templates: { type: 'object' },
    runtime: { type: 'object' },
  },
  additionalProperties: false,
} as const;
