# Zigrix 오케스트레이터/역할 설정 가이드

## 개요

Zigrix는 6가지 표준 에이전트 역할을 정의하고, 태스크 디스패치 시 역할 기반으로 에이전트를 자동 선택한다.
더 이상 `pro-zig`, `qa-zig` 같은 agent id가 코드에 하드코딩되어 있지 않다.
설정을 통해 어떤 에이전트가 어떤 역할을 맡을지 제어할 수 있다.

## 표준 역할 (6종)

| 역할 | 별칭 | 용도 |
|------|------|------|
| `orchestrator` | `pro`, `orchestrate` | 조율 / 실행 계획 |
| `qa` | `quality`, `test`, `testing` | QA / 회귀 검증 |
| `security` | `sec` | 보안 감사 |
| `frontend` | `front`, `ui`, `client` | UI / 클라이언트 |
| `backend` | `back`, `server`, `api` | API / DB / 서버 |
| `system` | `sys`, `infra`, `infrastructure`, `architecture` | 시스템 아키텍처 / 플랫폼 |

역할 값은 자동 정규화된다. `"infra"` → `"system"`, `"front"` → `"frontend"` 등.

## 설정 방법

### 1. 초기 설정 (onboard)

```bash
zigrix onboard --yes
```

OpenClaw의 `openclaw.json`에 등록된 에이전트를 자동 감지하여:
1. 에이전트 id / theme에서 역할을 추론 (예: `qa-zig` → `qa`, `back-zig` → `backend`)
2. `orchestratorId`를 자동 설정 (첫 번째 orchestrator 역할 에이전트)

인터랙티브 모드 (`--yes` 없이):
```bash
zigrix onboard
```
각 에이전트의 역할을 직접 선택할 수 있다.

### 2. orchestratorId 지정

```bash
zigrix onboard --orchestrator-id my-orch-agent --yes
zigrix configure --section agents --orchestrator-id my-orch-agent --yes
```

또는 설정 파일 직접 편집:
```json
{
  "agents": {
    "orchestration": {
      "orchestratorId": "my-orch-agent"
    }
  }
}
```

### 3. 에이전트 역할 변경

```bash
zigrix agent set-role back-zig --role system
```

## 태스크 디스패치 흐름

```bash
zigrix task dispatch \
  --title "새 기능 구현" \
  --description "..." \
  --scale normal \
  --json
```

디스패치 시 Zigrix가 자동으로:

1. **스케일 정책 확인**: `rules.scales.normal` → `requiredRoles: ["orchestrator", "qa"]`
2. **역할별 에이전트 매핑**: 레지스트리에서 각 역할에 해당하는 enabled 에이전트 검색
3. **필수 에이전트 선택**: requiredRoles의 에이전트 확정 (orchestrator 역할 → `orchestratorId` 우선)
4. **후보 에이전트 식별**: optionalRoles + 후보 순서 규칙으로 추가 가능한 에이전트 제시
5. **실행 유닛 생성**: `orchestratorId`, `qaAgentId`를 실행 owner로 지정

### 출력 예시 (JSON)
```json
{
  "ok": true,
  "taskId": "ZIG-20260319-001",
  "orchestratorId": "pro-zig",
  "qaAgentId": "qa-zig",
  "baselineRequiredAgents": ["pro-zig", "qa-zig"],
  "candidateAgents": ["front-zig", "back-zig"],
  "requiredRoles": ["orchestrator", "qa"],
  "optionalRoles": ["frontend", "backend"],
  "roleAgentMap": {
    "orchestrator": ["pro-zig"],
    "qa": ["qa-zig"],
    "frontend": ["front-zig"],
    "backend": ["back-zig"]
  }
}
```

## 검증 규칙

| 규칙 | 설명 |
|------|------|
| 역할 정규화 | 등록/변경 시 별칭이 표준 역할로 자동 변환 |
| 미지원 역할 거부 | `"wizard"` 같은 비표준 역할은 에러 |
| orchestratorId 검증 | orchestrator 역할 에이전트가 있을 때, orchestratorId는 반드시 레지스트리에 존재 |
| orchestratorId 제외 금지 | orchestratorId가 excluded 목록에 있으면 에러 |
| 스케일 역할 검증 | `rules.scales`의 역할이 표준 역할 목록에 없으면 경고 |

## FAQ

### Q: 기존에 하드코딩된 `pro-zig` / `qa-zig`는 어떻게 되나?
A: 기본값 예시로는 남아 있지만, 설정으로 오버라이드 가능. `orchestratorId`를 변경하면 실행 유닛 owner, 부트 프롬프트 대상, 필수 에이전트 목록이 함께 바뀐다.

### Q: 에이전트 하나가 여러 역할을 가질 수 있나?
A: 현재는 에이전트당 하나의 역할만 지원한다. 여러 역할이 필요하면 별도 에이전트로 분리 등록한다.

### Q: 새로운 역할을 추가할 수 있나?
A: 표준 역할 6종은 코드 상수로 정의되어 있다. 새 역할 추가는 코드 변경(`src/agents/roles.ts`)이 필요하다.
