# Zigrix Config Schema

## 목적
Zigrix의 설정을 코드 하드코딩이 아니라 schema 기반 계약으로 관리한다.

## Location
- Single source of truth file: `zigrix.config.json`
- Default location: `$ZIGRIX_HOME/zigrix.config.json` (fallback `~/.zigrix/zigrix.config.json`)
- Path contract consumers must read `paths.*` from this config model.

## Top-level shape
```json
{
  "paths": {},
  "workspace": {},
  "agents": {},
  "rules": {},
  "templates": {},
  "runtime": {}
}
```

## paths
```json
{
  "paths": {
    "baseDir": "/abs/path/to/zigrix-home",
    "tasksDir": "/abs/path/to/zigrix-home/tasks",
    "evidenceDir": "/abs/path/to/zigrix-home/evidence",
    "promptsDir": "/abs/path/to/zigrix-home/prompts",
    "eventsFile": "/abs/path/to/zigrix-home/tasks.jsonl",
    "indexFile": "/abs/path/to/zigrix-home/index.json",
    "runsDir": "/abs/path/to/zigrix-home/runs",
    "rulesDir": "/abs/path/to/zigrix-home/rules"
  }
}
```
- Paths are normalized to absolute paths at load/write time (`~` expansion + relative resolution).
- Tasks are NOT project-bound — a single Zigrix instance manages parallel tasks across projects

## workspace
```json
{
  "workspace": {
    "projectsBaseDir": "/abs/path/to/zigrix-home/workspace"
  }
}
```
- `projectsBaseDir`: default project root path (default concept: `~/.zigrix/workspace`, stored/resolved as absolute)

## agents
```json
{
  "agents": {
    "registry": {
      "orch-main": {
        "label": "orch-main",
        "role": "orchestrator",
        "runtime": "openclaw",
        "enabled": true,
        "metadata": {}
      },
      "qa-main": {
        "label": "qa-main",
        "role": "qa",
        "runtime": "openclaw",
        "enabled": true,
        "metadata": {}
      }
    },
    "orchestration": {
      "participants": ["orch-main", "qa-main"],
      "excluded": [],
      "orchestratorId": "orch-main"
    }
  }
}
```

### Standard Agent Roles
Zigrix enforces a closed set of standard roles. All role values in the registry and scale rules must resolve to one of these:

| Role | Aliases | Description |
|------|---------|-------------|
| `orchestrator` | `pro`, `orchestrate`, `orchestration` | Coordination / execution planning |
| `qa` | `quality`, `test`, `testing`, `qualityassurance` | Quality assurance / verification |
| `security` | `sec` | Security review / audit |
| `frontend` | `front`, `ui`, `client` | UI / client-side |
| `backend` | `back`, `server`, `api` | API / DB / server-side |
| `system` | `sys`, `infra`, `infrastructure`, `architecture` | System architecture / platform |

Role values are normalized automatically. Aliases like `"infra"` become `"system"`, `"front"` becomes `"frontend"`, etc.

### orchestratorId
- `orchestratorId`: the agent id that acts as orchestrator for dispatched tasks
- Must exist in registry when any orchestrator-role agent is registered
- Cannot be in `excluded` list
- Default: `"orchestrator"` (role-oriented default identifier; override after agent registration as needed)

### Registry rules
- registry: all known agents (each with a standard role)
- participants/excluded: orchestration membership control
- same agent in both participants and excluded → validation error
- participants/excluded referencing unknown agent → validation error

## rules
```json
{
  "rules": {
    "scales": {
      "simple": {
        "requiredRoles": ["orchestrator"],
        "optionalRoles": ["qa"]
      },
      "normal": {
        "requiredRoles": ["orchestrator", "qa"],
        "optionalRoles": ["frontend", "backend"]
      },
      "risky": {
        "requiredRoles": ["orchestrator", "qa", "security"],
        "optionalRoles": ["frontend", "backend", "system"]
      }
    },
    "completion": {
      "requireQa": true,
      "requireEvidence": true,
      "requireUserReport": true
    },
    "stale": {
      "defaultHours": 24
    }
  }
}
```
- Scale roles must be standard roles (see table above)
- `requiredRoles`: agents with these roles MUST complete for the task to finalize
- `optionalRoles`: agents with these roles MAY be included by the orchestrator

## templates
```json
{
  "templates": {
    "workerPrompt": {
      "format": "markdown",
      "version": 1,
      "placeholders": ["taskId", "title", "scale", "agentId", "description"],
      "body": "## Worker Assignment: {{taskId}}\n- title: {{title}}\n- scale: {{scale}}\n- agent: {{agentId}}\n- description: {{description}}"
    },
    "finalReport": {
      "format": "markdown",
      "version": 1,
      "placeholders": ["taskId", "title", "status", "summary"],
      "body": "## Final Report: {{taskId}}\n- title: {{title}}\n- status: {{status}}\n- summary: {{summary}}"
    }
  }
}
```
- mustache-style placeholders
- allowed placeholders are validated per template kind
- `zigrix rule validate` checks placeholders against allowed list

## runtime
```json
{
  "runtime": {
    "outputMode": "text",
    "jsonIndent": 2
  }
}
```
- `outputMode`: overridable via `ZIGRIX_OUTPUT_MODE` env
- `jsonIndent`: overridable via `ZIGRIX_JSON_INDENT` env

## Validation
- Zod schema enforced at load time (`zigrixConfigSchema`)
- Unknown keys: strict (rejected)
- Path writeability: checked by `zigrix doctor`
- Agent label uniqueness: enforced by registry
- Template placeholder whitelist: per template kind
- Role references: validated against standard roles list
- orchestratorId: validated against registry when orchestrator-role agents exist
