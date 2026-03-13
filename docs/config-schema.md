# Zigrix Config Schema Draft

## 목적
Zigrix의 설정을 코드 하드코딩이 아니라 schema 기반 계약으로 관리한다.

## Top-level shape
```json
{
  "paths": {},
  "agents": {},
  "rules": {},
  "templates": {},
  "openclaw": {},
  "runtime": {}
}
```

## paths
```json
{
  "paths": {
    "stateDir": ".zigrix",
    "tasksDir": ".zigrix/tasks",
    "evidenceDir": ".zigrix/evidence",
    "promptsDir": ".zigrix/prompts",
    "eventsFile": ".zigrix/tasks.jsonl",
    "indexFile": ".zigrix/index.json"
  }
}
```
- 상대경로는 project root 기준 resolve
- 절대경로 허용
- collision / parent-child overlap validation 필요

## agents
```json
{
  "agents": {
    "registry": {
      "qa-main": {
        "label": "qa-main",
        "role": "qa",
        "runtime": "openclaw-session",
        "enabled": true,
        "metadata": {}
      }
    },
    "orchestration": {
      "participants": ["qa-main"],
      "excluded": []
    }
  }
}
```
- registry에는 시스템이 아는 전체 agent 저장
- participants/excluded는 orchestration membership 제어
- 동일 agent가 participants/excluded 양쪽에 동시에 있으면 validation error

## rules
```json
{
  "rules": {
    "scales": {
      "simple": {
        "requiredRoles": ["orchestrator", "qa"],
        "optionalRoles": []
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
      "body": "## Worker Assignment: {{taskId}}"
    },
    "finalReport": {
      "format": "markdown",
      "body": "작업유형: {{scale}}"
    }
  }
}
```
- mustache-style placeholder 허용
- 허용 placeholder 목록 관리 필요
- render preview / validation 필요

## openclaw
```json
{
  "openclaw": {
    "home": "~/.openclaw",
    "skillsDir": "~/.openclaw/skills"
  }
}
```

## runtime
```json
{
  "runtime": {
    "defaultProjectRoot": ".",
    "outputMode": "text",
    "jsonIndent": 2
  }
}
```

## validation requirements
- unknown keys policy 결정 필요 (strict vs allow metadata)
- path writeability check
- agent label uniqueness
- template placeholder whitelist
- role references must resolve against registry or allowed role catalog
