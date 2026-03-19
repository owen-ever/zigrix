---
name: zigrix-main-agent
version: 0.1.0
description: Main-agent playbook for Zigrix task issuance, orchestrator spawn, dashboard usage, and Python-script-to-CLI migration.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
---

# Zigrix Main-Agent Guide

메인 에이전트(지그)가 Zigrix를 사용할 때의 표준 흐름이다.

## 1) 태스크 발급 (CLI 기준)

```bash
zigrix task dispatch \
  --title "<작업 제목>" \
  --description "<요청 본문>" \
  --scale normal \
  --project-dir /absolute/path/to/project \
  --json
```

핵심 출력값:
- `taskId`
- `proZigPrompt` (orchestrator에게 그대로 전달할 부트 프롬프트)
- `promptPath`, `metaPath`, `specPath`

## 2) 오케스트레이터 spawn (pro-zig)

메인 에이전트는 `proZigPrompt`를 그대로 `sessions_spawn`에 전달한다.

권장 파라미터:
- `agentId: "pro-zig"`
- `label: "[pro-zig] <taskId>"`
- `thread: true`
- `mode: "session"`

## 3) 진행 추적

```bash
zigrix task status <taskId> --json
zigrix task events <taskId> --json
zigrix task progress <taskId> --json
```

필요 시 대시보드:
```bash
zigrix dashboard --port 3838
```

## 4) 완료 처리

오케스트레이터가 워커 완료/증적 수집을 마친 뒤:

```bash
zigrix task finalize <taskId> --auto-report --json
```

## 5) Python 스크립트 체인 → Zigrix CLI 매핑

- `dev_dispatch.py` → `zigrix task dispatch`
- `dev_start.py` → `zigrix task start`
- `orch_prepare_worker.py` → `zigrix worker prepare`
- `orch_register_worker.py` → `zigrix worker register`
- `orch_complete_worker.py` → `zigrix worker complete`
- `dev_finalize.py` → `zigrix task finalize`

## 6) 운영 체크리스트

- `taskId` 기준으로 thread/session 매핑 유지
- `--json` 우선 사용 (자동화 파이프라인 안정성)
- QA evidence 없이 finalize하지 않음
- 역할 기반 선택은 `zigrix.config.json`의 `agents.registry` + `agents.orchestration.orchestratorId`를 기준으로 동작
