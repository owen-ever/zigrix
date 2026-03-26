---
name: zigrix-main-agent-guide
version: 0.2.0
description: Main-agent guide for using Zigrix CLI (task issuance, orchestrator spawn, dashboard, and path resolution).
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

디스패치 결과에서 확인하고 다음 에이전트에 전달할 핵심 필드:
- `taskId`
- `orchestratorId`
- `qaAgentId`
- `baselineRequiredAgents`
- `candidateAgents`
- `orchestratorPrompt`
- `specPath` — resolved absolute path to spec markdown
- `metaPath` — resolved absolute path to metadata JSON
- `promptPath` — resolved absolute path to dispatch prompt
- `projectDir` — resolved project directory

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
# 워커 준비 (returns promptPath, specPath, metaPath, projectDir)
zigrix worker prepare --task-id <taskId> --agent-id <agentId> --description "..." --json

# 워커 세션 등록
zigrix worker register --task-id <taskId> --agent-id <agentId> --session-key <sessionKey> --run-id <runId> --json

# 워커 완료
zigrix worker complete --task-id <taskId> --agent-id <agentId> --session-key <sessionKey> --run-id <runId> --json

# evidence 수집 (returns evidencePath)
zigrix evidence collect --task-id <taskId> --agent-id <agentId> --summary "..." --json

# evidence 머지 (returns mergedPath)
zigrix evidence merge --task-id <taskId> --require-qa --json

# 최종화
zigrix task finalize <taskId> --auto-report --json
```

## 5) 경로 해석이 필요할 때

CLI JSON 응답의 resolved path 필드를 우선 사용한다. 런타임 디렉토리만 필요하면:

```bash
zigrix path get tasksDir --json
zigrix path get workspace.projectsBaseDir --json
zigrix path list --json
```

bare symbolic key(`paths.tasksDir`, `workspace.projectsBaseDir`)를 파일 경로처럼 직접 쓰지 않는다.

## 6) 대시보드 사용 포인트

대시보드에서 확인:
- Task 상태 (OPEN → IN_PROGRESS → REPORTED)
- 워커 세션 매핑
- 이벤트 로그
- Conversation/증적 추적

문제 상황 디버깅 순서:
1. `zigrix task status <taskId> --json`
2. `zigrix task events <taskId> --json`
3. `zigrix evidence merge --task-id <taskId> --require-qa --json`

## 7) Standard CLI chain

| Step | Command | Key resolved path fields |
|------|---------|--------------------------|
| Dispatch | `zigrix task dispatch` | `specPath`, `metaPath`, `promptPath`, `projectDir` |
| Start | `zigrix task start` | |
| Worker prepare | `zigrix worker prepare` | `promptPath`, `specPath`, `metaPath`, `projectDir` |
| Worker register | `zigrix worker register` | |
| Worker complete | `zigrix worker complete` | |
| Evidence collect | `zigrix evidence collect` | `evidencePath` |
| Evidence merge | `zigrix evidence merge` | `mergedPath` |
| Finalize | `zigrix task finalize` | |

- JSON 출력(`--json`)을 기본으로 파이프라인에서 파싱
