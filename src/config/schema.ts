import path from 'node:path';

import { z } from 'zod';

import { STANDARD_AGENT_ROLES, normalizeAgentRole } from '../agents/roles.js';

const pathSchema = z.string().min(1);

export const STANDARD_SCALES = ['simple', 'normal', 'risky', 'large'] as const;

const standardRoleSchema = z.enum(STANDARD_AGENT_ROLES);

const roleSchema = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    const normalized = normalizeAgentRole(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `role must be one of: ${STANDARD_AGENT_ROLES.join(', ')}`,
      });
      return z.NEVER;
    }
    return normalized;
  })
  .pipe(standardRoleSchema);

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
  paths: z
    .object({
      baseDir: pathSchema,
      tasksDir: pathSchema,
      evidenceDir: pathSchema,
      promptsDir: pathSchema,
      eventsFile: pathSchema,
      indexFile: pathSchema,
      runsDir: pathSchema,
      rulesDir: pathSchema,
    })
    .superRefine((value, ctx) => {
      const directoryEntries = [
        ['tasksDir', value.tasksDir],
        ['evidenceDir', value.evidenceDir],
        ['promptsDir', value.promptsDir],
        ['runsDir', value.runsDir],
        ['rulesDir', value.rulesDir],
      ] as const;
      const fileEntries = [
        ['eventsFile', value.eventsFile],
        ['indexFile', value.indexFile],
      ] as const;

      const seen = new Map<string, string>();
      for (const [name, rawPath] of [...directoryEntries, ...fileEntries]) {
        const normalized = path.resolve(rawPath);
        const existing = seen.get(normalized);
        if (existing) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${name} collides with ${existing}`,
            path: [name],
          });
          continue;
        }
        seen.set(normalized, name);
      }

      const directoryPaths = new Set(directoryEntries.map(([, rawPath]) => path.resolve(rawPath)));
      for (const [name, rawPath] of fileEntries) {
        const normalized = path.resolve(rawPath);
        if (directoryPaths.has(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${name} must not resolve to a runtime directory path`,
            path: [name],
          });
        }
      }
    }),
  workspace: z.object({
    projectsBaseDir: z.string().default(''),
  }),
  agents: z
    .object({
      registry: z.record(z.string(), agentSchema),
      orchestration: z.object({
        participants: z.array(z.string()),
        excluded: z.array(z.string()),
        orchestratorId: z.string().min(1),
      }),
    })
    .superRefine((value, ctx) => {
      const overlap = value.orchestration.participants.filter((item) =>
        value.orchestration.excluded.includes(item),
      );
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
      const hasAnyOrchestrator = Object.values(value.registry).some(
        (agent) => agent.role === 'orchestrator',
      );

      if (hasAnyOrchestrator && !hasOrchestratorInRegistry) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `orchestratorId '${orchestratorId}' must exist in registry`,
          path: ['orchestration', 'orchestratorId'],
        });
      }

      if (hasOrchestratorInRegistry && value.registry[orchestratorId]?.enabled === false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `orchestratorId '${orchestratorId}' must reference an enabled agent`,
          path: ['orchestration', 'orchestratorId'],
        });
      }

      if (
        value.orchestration.participants.length > 0 &&
        hasOrchestratorInRegistry &&
        !value.orchestration.participants.includes(orchestratorId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `orchestratorId '${orchestratorId}' must be included in participants when participant mode is active`,
          path: ['orchestration', 'participants'],
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
    scales: z
      .record(
        z.string(),
        z.object({
          requiredRoles: z.array(roleSchema),
          optionalRoles: z.array(roleSchema),
        }),
      )
      .superRefine((value, ctx) => {
        for (const scale of STANDARD_SCALES) {
          if (!(scale in value)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `rules.scales must define '${scale}'`,
              path: [scale],
            });
          }
        }

        for (const [scale, policy] of Object.entries(value)) {
          const overlap = policy.requiredRoles.filter((role) =>
            policy.optionalRoles.includes(role),
          );
          for (const role of overlap) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `scale '${scale}' cannot list role '${role}' as both required and optional`,
              path: [scale],
            });
          }
        }
      }),
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
  openclaw: z
    .object({
      home: z.string().default(''),
      binPath: z.string().nullable().default(null),
      gatewayUrl: z.string().default(''),
    })
    .default({ home: '', binPath: null, gatewayUrl: '' }),
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
      required: [
        'baseDir',
        'tasksDir',
        'evidenceDir',
        'promptsDir',
        'eventsFile',
        'indexFile',
        'runsDir',
        'rulesDir',
      ],
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
    agents: {
      type: 'object',
      required: ['registry', 'orchestration'],
      properties: {
        registry: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            required: ['label', 'role', 'runtime'],
            properties: {
              label: { type: 'string' },
              role: { type: 'string', enum: [...STANDARD_AGENT_ROLES] },
              runtime: { type: 'string' },
              enabled: { type: 'boolean' },
              metadata: { type: 'object' },
            },
            additionalProperties: true,
          },
        },
        orchestration: {
          type: 'object',
          required: ['participants', 'excluded', 'orchestratorId'],
          properties: {
            participants: { type: 'array', items: { type: 'string' } },
            excluded: { type: 'array', items: { type: 'string' } },
            orchestratorId: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    rules: {
      type: 'object',
      required: ['scales', 'completion', 'stale'],
      properties: {
        scales: {
          type: 'object',
          required: [...STANDARD_SCALES],
          properties: Object.fromEntries(
            STANDARD_SCALES.map((scale) => [
              scale,
              {
                type: 'object',
                required: ['requiredRoles', 'optionalRoles'],
                properties: {
                  requiredRoles: {
                    type: 'array',
                    items: { type: 'string', enum: [...STANDARD_AGENT_ROLES] },
                  },
                  optionalRoles: {
                    type: 'array',
                    items: { type: 'string', enum: [...STANDARD_AGENT_ROLES] },
                  },
                },
                additionalProperties: false,
              },
            ]),
          ),
          additionalProperties: true,
        },
        completion: {
          type: 'object',
          required: ['requireQa', 'requireEvidence', 'requireUserReport'],
          properties: {
            requireQa: { type: 'boolean' },
            requireEvidence: { type: 'boolean' },
            requireUserReport: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        stale: {
          type: 'object',
          required: ['defaultHours'],
          properties: {
            defaultHours: { type: 'number', exclusiveMinimum: 0 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
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
