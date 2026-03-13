# Node Bootstrap Implementation Tasks

## First 10 tasks
1. create `package.json` with `bin`, `type`, scripts
2. create `tsconfig.json`
3. create `src/cli/main.ts`
4. create `src/config/schema.ts` (zod)
5. create `src/config/load.ts` (defaults/user/project/env/flags merge)
6. create `src/cli/config.ts` (`get`, `schema`, `validate`)
7. create `src/cli/init.ts` (interactive path setup)
8. create `src/agents/registry.ts` + `src/cli/agent.ts`
9. create `src/rules/templates.ts` + `src/cli/rule.ts`
10. create `vitest` smoke tests for config/agent/rule commands

## First shippable milestone
- `zigrix config schema`
- `zigrix config get`
- `zigrix config validate`
- `zigrix init`
- `zigrix agent list/add/include/exclude`
- `zigrix rule list/get/render/validate`
