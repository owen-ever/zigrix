# Zigrix Node 전환 + 설정형 orchestration 플랫폼 계획 (2026-03-13)

## 0. 왜 계획을 수정해야 하는가

기존 계획은 **독립 오픈소스 CLI**라는 방향은 맞았지만,
핵심 전제가 틀렸다.

틀린 전제:
- Python이 최종 구현 언어라고 봄
- rule/agent/path가 일부만 설정 가능해도 충분하다고 봄
- orchestration 로직의 고정 프롬프트는 코드 밖 관심사라고 봄

수정된 전제:
- **최종 Zigrix는 Node/TypeScript 기반 CLI**여야 한다.
- **설정이 제품의 중심**이어야 한다.
- **산출물 경로 / 에이전트 참여 여부 / 오케스트레이션 룰 / 프롬프트 템플릿 수정**이 전부 설정 계층에서 제어되어야 한다.

즉 Zigrix는 단순 CLI가 아니라,
**설정 가능한 orchestration platform**으로 설계해야 한다.

---

## 1. North Star 재정의

Zigrix는 아래 7가지를 만족해야 한다.

1. **Node 기반으로 빌드/배포가 쉬워야 한다**
2. **초기 셋업 시 산출물 경로를 설정할 수 있어야 한다**
3. **에이전트 registry와 orchestration 참여 집합을 분리해 관리할 수 있어야 한다**
4. **새 agent를 등록하고 orchestration 참여/제외를 동적으로 조정할 수 있어야 한다**
5. **scale rule, completion gate, prompt template을 설정으로 바꿀 수 있어야 한다**
6. **설정은 전역/프로젝트/환경변수/CLI override 계층으로 병합돼야 한다**
7. **OpenClaw configure 같은 UX로 schema 조회/수정/검증이 가능해야 한다**

---

## 2. 추천 기술 스택

### CLI / runtime
- **Node.js 22+**
- **TypeScript 5.x**
- CLI parser: **commander**
- config discovery: **cosmiconfig**
- schema validation: **zod**
- JSON Schema export/validation 보조: **zod-to-json-schema** 또는 **ajv**
- interactive setup/config edit: **@inquirer/prompts**
- YAML 지원(선택): **yaml**
- tests: **vitest**

### 선택 이유
- `commander`는 서브커맨드 CLI 구조와 help UX가 안정적임
- `cosmiconfig`는 user/project config 계층 탐색에 적합함
- `zod`는 runtime validation + TS type inference를 같이 줌
- `@inquirer/prompts`는 `zigrix init`, `zigrix config edit` 같은 인터랙티브 흐름에 적합함
- Node/npm은 package publish, versioning, release 자동화에 유리함

---

## 3. 설정 계층 모델

우선순위 낮음 → 높음 순서:

1. **built-in defaults**
2. **user config** (`~/.config/zigrix/config.json` 또는 cosmiconfig 경로)
3. **project config** (`<project>/zigrix.config.json` / `.zigrixrc.json`)
4. **environment variables**
5. **CLI flags**

### 이 계층이 필요한 이유
- 사용자별 기본 환경 보존
- 프로젝트별 runtime path / agent pool override 가능
- CI/배포 환경에서 일시적 override 가능
- 실제 실행에서는 CLI flag가 최종 우선권 가짐

---

## 4. 핵심 설정 도메인

## 4.1 Paths
```json
{
  "paths": {
    "stateDir": ".zigrix",
    "tasksDir": ".zigrix/tasks",
    "evidenceDir": ".zigrix/evidence",
    "promptsDir": ".zigrix/prompts",
    "indexFile": ".zigrix/index.json",
    "eventsFile": ".zigrix/tasks.jsonl"
  }
}
```

### 요구사항
- 초기 셋업에서 interactive하게 바꿀 수 있어야 함
- relative/absolute 둘 다 허용
- project root 기준 resolve 규칙 문서화
- path collision 검증 필요
- write permission 검증 필요

## 4.2 Agent registry vs orchestration participants
```json
{
  "agents": {
    "registry": {
      "front-main": {
        "label": "front-main",
        "role": "frontend",
        "runtime": "openclaw-session",
        "enabled": true,
        "metadata": {}
      },
      "qa-main": {
        "label": "qa-main",
        "role": "qa",
        "runtime": "openclaw-session",
        "enabled": true,
        "metadata": {}
      }
    },
    "orchestration": {
      "participants": ["front-main", "qa-main"],
      "excluded": []
    }
  }
}
```

### 핵심 규칙
- **registry**: 시스템에 알려진 agent 전체 목록
- **participants**: 현재 orchestration에 포함된 agent 집합
- **excluded**: registry에는 있지만 현재 orchestration에 쓰지 않는 agent

이 분리가 있어야:
- 신규 agent 추가
- 기존 agent 제외
- 프로젝트별 subset 운영
이 가능하다.

## 4.3 Rules
```json
{
  "rules": {
    "scales": {
      "simple": {
        "requiredRoles": ["orchestrator", "qa"],
        "optionalRoles": []
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
    }
  }
}
```

### 포함돼야 하는 rule 범위
- scale별 required/optional role
- completion gate
- QA 필수 여부
- report/feedback 정책
- stale 기준
- evidence completeness 기준

## 4.4 Prompt / template rules
```json
{
  "templates": {
    "workerPrompt": {
      "format": "markdown",
      "body": "## Worker Assignment: {{taskId}}\n..."
    },
    "finalReport": {
      "format": "markdown",
      "body": "작업유형: {{scale}}\n..."
    }
  }
}
```

### 여기서 중요한 점
네가 말한 "rule 수정"에는 단순 scale matrix만이 아니라,
**지금 `orchestration/rules/*.md`에 있는 프롬프트 내용 자체 수정**도 포함된다.

그래서 Zigrix는 아래를 지원해야 한다.

1. built-in template 제공
2. project override 가능
3. schema/placeholder validation 가능
4. preview/render 가능
5. diff/rollback 가능

즉 rule 시스템은 **정책 + 텍스트 템플릿** 두 축을 모두 가져야 한다.

---

## 5. 필요한 CLI surface

## 5.1 config 계열
- `zigrix config init`
- `zigrix config get [path]`
- `zigrix config set <path> <json>`
- `zigrix config edit`
- `zigrix config schema [path]`
- `zigrix config validate`
- `zigrix config explain [path]`

## 5.2 agent 계열
- `zigrix agent list`
- `zigrix agent add`
- `zigrix agent remove`
- `zigrix agent enable`
- `zigrix agent disable`
- `zigrix agent include`
- `zigrix agent exclude`
- `zigrix agent set-role`
- `zigrix agent validate`

## 5.3 rule 계열
- `zigrix rule list`
- `zigrix rule get <path>`
- `zigrix rule set <path> <json>`
- `zigrix rule edit [template|policy]`
- `zigrix rule validate`
- `zigrix rule render <template>`
- `zigrix rule diff`

## 5.4 orchestration/task 계열
- `zigrix init`
- `zigrix doctor`
- `zigrix task create`
- `zigrix task list`
- `zigrix task status`
- `zigrix task progress`
- `zigrix task stale`
- `zigrix worker prepare`
- `zigrix worker register`
- `zigrix worker complete`
- `zigrix evidence collect`
- `zigrix evidence merge`
- `zigrix report render`
- `zigrix pipeline run`

---

## 6. 아키텍처 제안

```text
src/
├─ cli/
│  ├─ main.ts
│  ├─ config.ts
│  ├─ agent.ts
│  ├─ rule.ts
│  ├─ task.ts
│  └─ ...
├─ config/
│  ├─ schema.ts
│  ├─ load.ts
│  ├─ merge.ts
│  ├─ env.ts
│  └─ paths.ts
├─ agents/
│  ├─ registry.ts
│  ├─ membership.ts
│  └─ selection.ts
├─ rules/
│  ├─ policies.ts
│  ├─ templates.ts
│  ├─ render.ts
│  └─ validate.ts
├─ state/
│  ├─ tasks.ts
│  ├─ evidence.ts
│  ├─ events.ts
│  └─ index.ts
├─ orchestration/
│  ├─ pipeline.ts
│  ├─ worker.ts
│  └─ report.ts
└─ shared/
   ├─ types.ts
   └─ errors.ts
```

---

## 7. Phase 재정의

## Phase A — Python prototype 동결
- Python 구현은 reference/prototype로만 유지
- 새 기능 추가 중단
- Node 재설계 문서 우선

## Phase B — config-first Node skeleton
산출물:
- `package.json`
- `tsconfig.json`
- `src/config/*`
- `src/cli/config.ts`
- `src/cli/init.ts`

게이트:
- `zigrix config schema`
- `zigrix config get`
- `zigrix config validate`
- `zigrix init` interactive path setup 동작

## Phase C — agent pool / membership model
산출물:
- registry model
- participants/excluded model
- include/exclude commands
- role assignment model

게이트:
- agent 추가/제외/재포함 가능
- role validation 가능
- config에 반영 후 orchestration selection이 따라감

## Phase D — rule/prompt editing engine
산출물:
- policy schema
- template schema
- placeholder validator
- preview/diff/render

게이트:
- built-in workerPrompt/finalReport 수정 가능
- invalid placeholder/schema 변경 차단
- project override 가능

## Phase E — orchestration runtime migration
산출물:
- task/worker/evidence/report/stale/pipeline Node 구현
- 기존 Python prototype parity 확보

게이트:
- 동일 golden path Node만으로 end-to-end 동작

## Phase F — packaging/release hardening
산출물:
- npm package
- GitHub Release assets
- checksums
- install/update/uninstall docs

---

## 8. 위험요인

1. **Python prototype와 Node 본체 이중 관리 비용**
2. **prompt/rule을 설정화하면서 validation 없으면 운영 품질 붕괴 가능**
3. **agent registry와 OpenClaw 실제 runtime 간 sync 문제**
4. **너무 자유로운 설정이 오히려 제품 복잡도를 키울 위험**

### 대응
- schema-first
- built-in defaults 유지
- `config validate` / `rule validate` 강제
- explain/preview/diff 지원

---

## 9. 완료 기준 (새 기준)

Zigrix를 완제품에 가깝다고 부르려면 최소 아래가 되어야 한다.

- Node/TS 구현체 존재
- config 계층 동작
- path setup 가능
- agent registry + participants/excluded 동작
- rule/prompt editing 가능
- task/evidence/report/stale/pipeline Node 구현 완료
- npm/GitHub Release 배포 가능
- docs와 schema가 일치

---

## 10. 즉시 다음 액션

1. `docs/node-architecture.md`
2. `docs/config-schema.md`
3. `docs/agent-model.md`
4. `docs/rule-model.md`
5. `docs/prompt-template-model.md`
6. `docs/migration-plan-python-to-node.md`
7. `docs/implementation-bootstrap-node.md`
8. Node repo skeleton 생성 (`package.json`, `tsconfig.json`, `src/`)
9. config schema + `config get/schema/validate`
10. interactive `zigrix init`

이 10개가 먼저다.
