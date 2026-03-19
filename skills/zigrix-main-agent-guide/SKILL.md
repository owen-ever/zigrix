---
name: zigrix-main-agent-guide
version: 0.1.0
description: Main-agent guide for using Zigrix CLI (task issuance, orchestrator spawn, dashboard, and Python-script-to-CLI migration).
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
---

# Zigrix Main Agent Guide

메인 에이전트가 Zigrix를 사용할 때의 표준 흐름.

## 1) 기본 명령

```bash
# 초기 설정
zigrix onboard --yes --json

# 환경/설정 점검
zigrix doctor
zigrix config validate --json
zigrix agent list --json

# 대시보드 실행
zigrix dashboard --port 5173
```

## 2) 태스크 발급 흐름 (권장)

`task create`보다 `task dispatch`를 우선 사용한다.

```bash
zigrix task dispatch \
  --title "Implement X" \
  --description "..." \
  --scale normal \
  --project-dir /path/to/project \
  --json
```

디스패치 결과에서 확인할 핵심 필드:
- `taskId`
- `orchestratorId`
- `qaAgentId`
- `baselineRequiredAgents`
- `candidateAgents`
- `orchestratorPrompt` (`proZigPrompt` 호환 별칭 포함)

## 3) 오케스트레이터 spawn 패턴

디스패치 응답의 `orchestratorPrompt`를 오케스트레이터 에이전트에게 전달한다.

```text
sessions_spawn(
  agentId: <orchestratorId>,
  task: <dispatchResult.orchestratorPrompt>
)
```

오케스트레이터는 이후 워커를 `zigrix worker prepare/register/complete` 체인으로 관리한다.

## 4) 워커/검증/최종 보고 체인

```bash
# 워커 준비
zigrix worker prepare --task-id <taskId> --agent-id <agentId> --description "..." --json

# 워커 세션 등록
zigrix worker register --task-id <taskId> --agent-id <agentId> --session-key <sessionKey> --run-id <runId> --json

# 워커 완료
zigrix worker complete --task-id <taskId> --agent-id <agentId> --session-key <sessionKey> --run-id <runId> --json

# evidence 수집/머지
zigrix evidence collect --task-id <taskId> --agent-id <agentId> --summary "..." --json
zigrix evidence merge --task-id <taskId> --require-qa --json

# 최종화
zigrix task finalize <taskId> --auto-report --json
```

## 5) 대시보드 사용 포인트

대시보드에서 확인:
- Task 상태 (OPEN → IN_PROGRESS → REPORTED)
- 워커 세션 매핑
- 이벤트 로그
- Conversation/증적 추적

문제 상황 디버깅 순서:
1. `zigrix task status <taskId> --json`
2. `zigrix task events <taskId> --json`
3. `zigrix evidence merge --task-id <taskId> --require-qa --json`

## 6) Python 스크립트 체인 → Zigrix CLI 전환 가이드

기존(레거시 Python):
- `dev_dispatch.py`
- `dev_start.py`
- `orch_prepare_worker.py`
- `orch_register_worker.py`
- `orch_complete_worker.py`
- `dev_finalize.py`

신규(권장 Zigrix CLI):
- `zigrix task dispatch`
- `zigrix task start`
- `zigrix worker prepare`
- `zigrix worker register`
- `zigrix worker complete`
- `zigrix task finalize`

전환 원칙:
- 신규 자동화는 CLI 우선
- Python 스크립트는 호환/과도기용
- JSON 출력(`--json`)을 기본으로 파이프라인에서 파싱
