import { type ZigrixConfig } from '../config/schema.js';

export const TEMPLATE_PLACEHOLDERS = {
  workerPrompt: ['taskId', 'title', 'scale', 'agentId', 'description', 'constraints', 'requiredRoles', 'workPackage', 'unitId'],
  finalReport: ['taskId', 'title', 'scale', 'status', 'summary', 'missingAgents'],
} as const;

const PLACEHOLDER_RE = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export type TemplateKind = keyof typeof TEMPLATE_PLACEHOLDERS;

export function listRules(config: ZigrixConfig): Array<{ path: string; kind: 'policy' | 'template' }> {
  return [
    { path: 'rules.scales', kind: 'policy' },
    { path: 'rules.completion', kind: 'policy' },
    { path: 'rules.stale', kind: 'policy' },
    { path: 'templates.workerPrompt', kind: 'template' },
    { path: 'templates.finalReport', kind: 'template' },
  ];
}

export function extractPlaceholders(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER_RE)) {
    const key = match[1]?.trim();
    if (key) found.add(key);
  }
  return [...found];
}

export function validateTemplate(kind: TemplateKind, body: string): {
  ok: boolean;
  placeholders: string[];
  allowed: readonly string[];
  unknown: string[];
  missingRecommended: string[];
} {
  const placeholders = extractPlaceholders(body);
  const allowed = TEMPLATE_PLACEHOLDERS[kind];
  const unknown = placeholders.filter((item) => !allowed.includes(item as never));
  const missingRecommended = allowed.filter((item) => !placeholders.includes(item));
  return {
    ok: unknown.length === 0,
    placeholders,
    allowed,
    unknown,
    missingRecommended,
  };
}

export function validateRules(config: ZigrixConfig): {
  ok: boolean;
  templates: Record<string, ReturnType<typeof validateTemplate>>;
  invalidRoles: string[];
} {
  const knownRoles = new Set(Object.values(config.agents.registry).map((agent) => agent.role));
  knownRoles.add('orchestrator');
  knownRoles.add('qa');
  knownRoles.add('frontend');
  knownRoles.add('backend');
  knownRoles.add('security');
  knownRoles.add('infra');

  const invalidRoles = new Set<string>();
  for (const scale of Object.values(config.rules.scales)) {
    for (const role of [...scale.requiredRoles, ...scale.optionalRoles]) {
      if (!knownRoles.has(role)) invalidRoles.add(role);
    }
  }

  const templates = {
    workerPrompt: validateTemplate('workerPrompt', config.templates.workerPrompt.body),
    finalReport: validateTemplate('finalReport', config.templates.finalReport.body),
  };

  return {
    ok: invalidRoles.size === 0 && Object.values(templates).every((item) => item.ok),
    templates,
    invalidRoles: [...invalidRoles].sort(),
  };
}

export function renderTemplate(kind: TemplateKind, body: string, context: Record<string, unknown>): string {
  return body.replaceAll(PLACEHOLDER_RE, (_full, key: string) => {
    const value = context[key];
    if (Array.isArray(value)) return value.join(', ');
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}
