---
name: zigrix-main-agent-guide
version: 0.3.0
description: Main-agent-only guide for Zigrix CLI (task issuance, orchestrator spawn, `/oz` handoff guard, dashboard, and path resolution). Never use this skill as orchestrator/worker runtime instruction.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
---

# Zigrix Main Agent Guide (MAIN-ONLY)

메인 에이전트가 Zigrix를 사용할 때의 표준 흐름.

## 0) Scope Guard (Critical)

이 스킬은 **main agent 전용**이다.

- 허용 주체: 사용자 요청을 받아 `dispatch/spawn/report`를 수행하는 **main agent**
- 금지 주체: orchestrator/worker runtime 세션(역할 워커 세션 전반)

오케스트레이터/워커는 이 스킬을 런타임 규칙으로 사용하지 않는다.  
오케스트레이터/워커의 canonical instruction은 `zigrix/rules/defaults/*` + dispatch/worker overlay prompt다.

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
  --json
```

기본적으로는 `workspace.projectsBaseDir` 설정값을 따르므로, 메인 에이전트는 보통 `--project-dir`를 붙이지 않는다.
`--project-dir`는 기존 프로젝트를 이어받거나 기본 경로를 명시적으로 override해야 할 때만 사용한다.

디스패치 결과에서 확인하고 다음 에이전트에 전달할 핵심 필드:
- `taskId`
- `orchestratorId`
- `qaAgentId`
- `baselineRequiredAgents`
- `candidateAgents`
- `orchestratorPrompt`
- `orchestratorLabel`
- `specPath` — resolved absolute path to spec markdown
- `metaPath` — resolved absolute path to metadata JSON
- `promptPath` — resolved absolute path to dispatch prompt
- `projectDir` — resolved project directory

## 3) 오케스트레이터 spawn 패턴

디스패치 응답의 `orchestratorPrompt`를 오케스트레이터 에이전트에게 전달한다.

```text
sessions_spawn(
  agentId: <orchestratorId>,
  label: <dispatchResult.orchestratorLabel>,
  cwd: <dispatchResult.projectDir>,
  task: <dispatchResult.orchestratorPrompt>
)
```

spawn 직후 main agent는 반환된 실제 세션 ref를 즉시 바인딩한다.

```bash
zigrix task bind-orchestrator --task-id <taskId> --agent-id <orchestratorId> --session-key <childSessionKey> --session-id <childSessionId> --json
```

오케스트레이터는 이후 워커를 `zigrix worker prepare/register/complete` 체인으로 관리한다.

### `/oz` and delegation guard

`/oz` skill 또는 자연어 위임 라우팅이 현재 턴을 **delegate** 로 판정했다면, 메인 에이전트는 실행자가 아니라 **router** 다.

이 경우:
- 허용: `zigrix task dispatch`, dispatch 결과 확인, `sessions_spawn`, 상태/실패 보고
- 금지: 직접 구현, 직접 파일 수정으로 우회, direct fallback
- dispatch/spawn 실패 시: 실패를 보고하고 중단

즉, Zigrix handoff가 시작된 이후에는 메인 에이전트가 로컬 직접 작업으로 대체하지 않는다.

## 4) 워커/검증/최종 보고 체인

```bash
# 워커 준비 (returns promptPath, specPath, metaPath, projectDir, spawnLabel)
zigrix worker prepare --task-id <taskId> --agent-id <agentId> --description "..." --json

# 워커 세션 등록
zigrix worker register --task-id <taskId> --agent-id <agentId> --session-key <sessionKey> --label <spawnLabel> --project-dir <projectDir> --run-id <runId> --json

# 참고: 여기서의 --project-dir 는 dispatch/prepare 응답으로 이미 resolve된 값을 그대로 전달하는 worker registration 인자다.
# task dispatch 기본 패턴과는 다르게, register 단계에서는 유지한다.

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
| Dispatch | `zigrix task dispatch` | `specPath`, `metaPath`, `promptPath`, `projectDir`, `orchestratorLabel` |
| Start | `zigrix task start` | |
| Worker prepare | `zigrix worker prepare` | `promptPath`, `specPath`, `metaPath`, `projectDir`, `spawnLabel` |
| Worker register | `zigrix worker register` | |
| Worker complete | `zigrix worker complete` | |
| Evidence collect | `zigrix evidence collect` | `evidencePath` |
| Evidence merge | `zigrix evidence merge` | `mergedPath` |
| Finalize | `zigrix task finalize` | |

- JSON 출력(`--json`)을 기본으로 파이프라인에서 파싱
