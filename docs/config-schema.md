# Zigrix Config Schema

## 목적
Zigrix의 설정을 코드 하드코딩이 아니라 schema 기반 계약으로 관리한다.

## Location
- Default: `~/.zigrix/zigrix.config.json`
- Override: `ZIGRIX_HOME` env → `$ZIGRIX_HOME/zigrix.config.json`
- Also supports YAML: `zigrix.config.yaml` / `zigrix.config.yml`

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
    "baseDir": "~/.zigrix",
    "tasksDir": "~/.zigrix/tasks",
    "evidenceDir": "~/.zigrix/evidence",
    "promptsDir": "~/.zigrix/prompts",
    "eventsFile": "~/.zigrix/tasks.jsonl",
    "indexFile": "~/.zigrix/index.json",
    "runsDir": "~/.zigrix/runs",
    "rulesDir": "~/.zigrix/rules"
  }
}
```
- All paths are absolute by default (resolved from `ZIGRIX_HOME`)
- Tasks are NOT project-bound — a single Zigrix instance manages parallel tasks across projects

## workspace
```json
{
  "workspace": {
    "projectsBaseDir": ""
  }
}
```
- `projectsBaseDir`: default directory for new project creation (empty = not set)

## agents
```json
{
  "agents": {
    "registry": {
      "qa-zig": {
        "label": "qa-zig",
        "role": "QA Agent",
        "runtime": "openclaw",
        "enabled": true,
        "metadata": {}
      }
    },
    "orchestration": {
      "participants": ["qa-zig"],
      "excluded": []
    }
  }
}
```
- registry: all known agents
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
        "optionalRoles": ["frontend", "backend", "infra"]
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
- Role references: validated against registry
