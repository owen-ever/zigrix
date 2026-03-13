# Zigrix CLI 분석 메모 (2026-03-13)

## 0. 결론 먼저

지금의 Zigrix는 **OpenClaw 내부 운영용 orchestration 스크립트 묶음**에 가깝고,
바로 외부 배포 가능한 일반용 CLI는 아니다.

하지만 방향은 좋다. 이미 있는 자산은 강하다.

- 역할 규칙(`rules/`)
- 실행 수명주기 스크립트(`scripts/`)
- append-only 이벤트 레저(`tasks.jsonl`)
- 메타/세션 복원 설계(`*.meta.json`, sessionId 보강)
- QA / finalize / report 흐름

즉, **핵심 로직은 이미 있다. 부족한 것은 제품화 레이어**다.

가장 현실적인 권장안은 아래다.

> **v0.1 권장안:**
> - Zigrix를 **독립 Python CLI**로 만든다.
> - 배포는 **GitHub Releases + install.sh** 중심으로 한다.
> - OpenClaw 연동은 **plugin 없이 skill pack + `zigrix` 바이너리** 방식으로 시작한다.
> - 이후 필요하면 **선택형 OpenClaw plugin**으로 확장한다.

이 방식이 현재 코드/운영 방식/배포 복잡도/사용자 경험을 모두 감안했을 때 가장 안전하다.

---

## 1. 현재 Zigrix 상태 파악

현재 Zigrix 실체는 `/Users/janos/.openclaw/workspace/orchestration/` 아래에 있다.

### 1-1. 현재 repo 성격

현재 구조는 독립 git repo로 분리되어 있고, README 기준 정체성은 다음과 같다.

- OpenClaw 기반 개발 위임/추적 오케스트레이션 레이어
- 프롬프트만으로 굴리는 느슨한 멀티에이전트가 아니라
- **스크립트와 규칙으로 강제되는 운영 파이프라인**

### 1-2. 현재 확인된 구성 규모

실제 확인 기준:

- 총 파일 수(상위 2단계 기준): 약 **203개**
- task spec markdown: **102개**
- meta 파일: **19개**
- dispatch prompt 파일: **21개**
- rules 파일: **7개**
- 주요 스크립트: 약 **16개**

핵심 구조:

```text
orchestration/
├─ README.md
├─ EVENT-MODEL.md
├─ MIGRATION-STRATEGY.md
├─ TEST-CASES.md
├─ rules/
├─ scripts/
├─ tasks/
├─ prompts/
├─ tasks.jsonl
└─ index.json
```

### 1-3. 현재 운용 흐름

현재 운용은 대략 아래 체인으로 굴러간다.

1. `dev_dispatch.py`
   - task id 생성
   - task/meta/prompt 생성
   - selected agents / execution units skeleton 구성

2. `dev_start.py`
   - task 시작 전환
   - orchestrator sessionKey/sessionId를 meta에 기록
   - 워커 호출 절차 안내

3. `orch_prepare_worker.py`
   - 특정 워커에게 넘길 prompt 생성
   - execution unit 상태 `IN_PROGRESS` 전환 가능

4. `orch_register_worker.py`
   - spawn 직후 worker sessionKey/runId/sessionId를 ledger/meta에 등록

5. `orch_complete_worker.py`
   - worker 완료/blocked/skipped 기록
   - unit 상태 반영
   - 다음 단계 결정

6. `dev_finalize.py`
   - evidence/완료상태/final report 흐름 종결

보조 스크립트:

- `collect_evidence.py`
- `merge_evidence.py`
- `rebuild_index.py`
- `stale_task_check.py`
- `run_pipeline.py`

### 1-4. 현재 데이터 모델

핵심은 아래 3개다.

- `tasks.jsonl`: append-only event ledger
- `index.json`: projection / 상태 인덱스
- `tasks/<taskId>.meta.json`: 세션/워크유닛/선택 에이전트 등 상세 메타

이건 CLI 제품화 관점에서 꽤 좋다.

이유:
- 이벤트 소싱 스타일이라 추적/복원에 강함
- AI 에이전트가 중간에 망가져도 상태를 재구성하기 쉽다
- 보고/증적/QA 흐름이 명시적이다

### 1-5. 강점

현재 Zigrix의 진짜 강점은 다음이다.

1. **운영 실패를 반영한 설계**
   - 그냥 멋있는 구조가 아니라 실운영 문제를 막기 위한 흐름이다.

2. **세션 추적/복원 의식이 강함**
   - OpenClaw의 session cleanup 이후를 고려해 `sessionId`를 meta에 보존한다.

3. **QA / evidence / report가 수명주기에 포함됨**
   - 많은 멀티에이전트 시스템이 여기서 무너지는데 Zigrix는 이미 포함하고 있다.

4. **스크립트 경계가 꽤 명확함**
   - dispatch / start / prepare / register / complete / finalize로 분해되어 있다.

즉, 제품화할 때 완전히 새로 만들 필요는 없다.

---

## 2. 지금 상태에서 바로 공개용 CLI가 안 되는 이유

핵심 문제는 **휴대성(portability) 부족**이다.

### 2-1. 절대경로 하드코딩

현재 주요 스크립트는 아래 경로를 직접 박고 있다.

- `/Users/janos/.openclaw/workspace`
- `/Users/janos/.openclaw/workspace-pro-zig/projects`
- `/Users/janos/.openclaw/agents`

이 상태로는:
- 다른 사람 환경에서 바로 동작 불가
- 다중 workspace 지원 어려움
- 테스트/배포/릴리즈 불편

이건 공개 CLI 전환의 **최우선 제거 대상**이다.

### 2-2. OpenClaw 로컬 환경 의존성

현재 Zigrix는 사실상 다음을 전제한다.

- OpenClaw 세션 저장소 구조를 알고 있음
- 특정 agentId 체계(`pro-zig`, `front-zig`, `qa-zig` 등)가 존재함
- 특정 workspace 레이아웃이 있음
- 메인/서브에이전트 역할 분담이 이미 정해져 있음

즉, 지금은 “범용 CLI”가 아니라 **이후락 환경에 맞춘 orchestration runtime**에 가깝다.

### 2-3. 명령면(command surface)이 스크립트 단위로 노출됨

현재는 사용자가 이런 식으로 알아야 한다.

- `dev_dispatch.py`
- `dev_start.py`
- `orch_prepare_worker.py`
- `orch_register_worker.py`
- `orch_complete_worker.py`
- `dev_finalize.py`

이건 사람에게도 불편하고 에이전트에게도 덜 친절하다.

공개용 CLI는 `zigrix <group> <command>` 형태로 재조직돼야 한다.

### 2-4. 제품 메타데이터 부재

아직 없는 것들:

- 패키징 메타데이터 (`pyproject.toml` 등)
- 버전 정책
- 릴리즈 아티팩트 설계
- 설치 경로 정책
- 설정/상태/캐시 디렉토리 정책
- 업그레이드 / uninstall 정책
- stable JSON output 계약
- exit code 규약

즉, 코드가 없는 게 아니라 **제품 경계가 없다**.

---

## 3. gws 스타일에서 배울 점

참고 대상으로 본 Google Workspace CLI(`gws`)는 대략 이런 특징을 가진다.

- `gws`라는 명확한 단일 바이너리/명령 이름
- 구조화된 JSON 출력
- 사람이 써도 되고 AI agent가 써도 되게 설계
- OpenClaw에서 읽을 수 있는 **Agent Skill(SKILL.md)** 들을 함께 제공
- 설치 경로가 명확함 (`npm install -g`, 릴리즈 바이너리 등)
- CLI 본체와 agent skill이 같이 배포됨

Zigrix가 여기서 가져와야 할 핵심은 4가지다.

1. **단일 진입점**
   - `zigrix ...`

2. **기계 친화적 출력**
   - 표보다 JSON 우선

3. **CLI 본체와 OpenClaw skill pack의 결합 배포**
   - 설치하면 OpenClaw agent가 바로 활용 가능해야 함

4. **설치/업데이트가 단순해야 함**
   - install.sh로 끝나야 함

중요한 점:
`gws`는 “OpenClaw plugin 그 자체”라기보다,
**외부 CLI + skill pack**으로 OpenClaw에 붙는 모델에 가깝다.

이게 Zigrix에도 맞다.

---

## 4. OpenClaw에서 Zigrix를 활용하게 만드는 현실적인 방식

OpenClaw 쪽 현재 확인 기준:

- `openclaw plugins install <path-or-spec>` 지원
- plugin manifest(`openclaw.plugin.json`)에서 `skills: ["./skills"]` 형태 지원
- skill frontmatter에서 `metadata.openclaw.requires.bins` 지원
- skill frontmatter에서 install metadata(`brew`, `node`, `go`, `uv`, `download`)도 해석 가능한 구조가 있음

즉, OpenClaw 연동 방식은 크게 3가지다.

### 방식 A. CLI + skill pack (plugin 없음)

구성:
- `zigrix` 바이너리 설치
- `skills/zigrix-*` 디렉토리 제공
- install.sh가 이를 `~/.openclaw/skills/` 아래에 copy/symlink

장점:
- 가장 단순함
- 현재 구조에서 가장 빨리 갈 수 있음
- OpenClaw plugin 시스템에 덜 묶임
- 디버깅 쉬움

단점:
- plugin처럼 `openclaw plugins list`에 예쁘게 안 보임
- skill 배포/업데이트를 설치 스크립트가 관리해야 함

**v0.1 최적안**이다.

### 방식 B. CLI + OpenClaw companion plugin

구성:
- `zigrix` 바이너리는 별도 설치
- `zigrix-openclaw` plugin이 `openclaw.plugin.json` + `skills/` 보유
- 사용자는 `openclaw plugins install ...`로 skill pack 등록

장점:
- OpenClaw 생태계에 더 자연스럽게 보임
- skill 관리가 plugin install/update에 묶임
- 향후 config schema / UI hint 붙이기 좋음

단점:
- 패키징 복잡도 증가
- v0.1에서 과함
- Zigrix 자체가 plugin은 아닌데 plugin처럼 보여 경계가 흐려질 수 있음

**v0.2 이후 권장**이다.

### 방식 C. Zigrix를 OpenClaw plugin으로 직접 구현

이건 비추천.

이유:
- Zigrix의 본질은 “외부 orchestration CLI”에 더 가깝다.
- plugin으로 직접 구현하면 OpenClaw 내부 API/런타임에 과도하게 결합된다.
- 범용 CLI로 쓰려는 목표와 어긋난다.

즉, **Zigrix 본체는 plugin이 아니라 CLI**여야 한다.

---

## 5. 권장 아키텍처

## 5-1. 제품 분리 원칙

권장 분리:

1. **zigrix-core / zigrix-cli**
   - Python 패키지
   - 설치 대상
   - 명령 제공

2. **zigrix-skills**
   - OpenClaw용 SKILL.md 모음
   - 또는 같은 repo 내 `skills/` 디렉토리

3. **runtime state**
   - 사용자의 프로젝트나 XDG 경로에 저장

즉, 소스 코드와 실행 상태를 분리해야 한다.

### 5-2. 디렉토리 정책 권장안

#### 설정
- `~/.config/zigrix/config.toml`

#### 전역 상태
- `~/.local/share/zigrix/`

#### 캐시
- `~/.cache/zigrix/`

#### 프로젝트 로컬 상태(권장)
- `<repo>/.zigrix/`

예:

```text
my-project/
├─ .zigrix/
│  ├─ tasks.jsonl
│  ├─ index.json
│  ├─ tasks/
│  ├─ prompts/
│  └─ evidence/
```

이게 중요한 이유:
- 현재처럼 소스 repo 내부 `orchestration/`에 런타임 산출물을 섞지 않게 됨
- 각 프로젝트별 ledger 분리 가능
- 여러 사용자/환경에서 재현 가능

### 5-3. 명령 구조 권장안

현재 스크립트를 기반으로 재구성하면 아래가 자연스럽다.

```bash
zigrix init
zigrix doctor
zigrix version

zigrix task create
zigrix task start
zigrix task status
zigrix task list
zigrix task finalize
zigrix task stale

zigrix worker prepare
zigrix worker register
zigrix worker complete

zigrix evidence collect
zigrix evidence merge

zigrix index rebuild
```

현재 스크립트 대응표:

- `dev_dispatch.py` → `zigrix task create`
- `dev_start.py` → `zigrix task start`
- `orch_prepare_worker.py` → `zigrix worker prepare`
- `orch_register_worker.py` → `zigrix worker register`
- `orch_complete_worker.py` → `zigrix worker complete`
- `collect_evidence.py` → `zigrix evidence collect`
- `merge_evidence.py` → `zigrix evidence merge`
- `dev_finalize.py` → `zigrix task finalize`
- `rebuild_index.py` → `zigrix index rebuild`
- `stale_task_check.py` → `zigrix task stale`

### 5-4. 출력 규약

OpenClaw 에이전트가 주 사용자이므로 출력은 무조건 아래 원칙이 좋다.

- 기본: `--json` 지원 필수
- 가능하면 기본 출력도 machine-friendly
- stdout에는 결과만
- stderr에는 힌트/경고
- exit code 의미 명확화

권장 exit code 예시:

- `0` success
- `1` runtime/general error
- `2` config error
- `3` validation error
- `4` state not found / task not found
- `5` integration error (OpenClaw session store 등)

---

## 6. v0.1에서 꼭 필요한 조건

### 6-1. 절대경로 제거

최우선.

반드시 아래를 바꿔야 한다.

- `ROOT = Path('/Users/janos/.openclaw/workspace')`
- `PROJECTS_ROOT = '/Users/janos/.openclaw/workspace-pro-zig/projects'`
- `AGENTS_STATE_DIR = Path('/Users/janos/.openclaw/agents')`

대신:
- CLI 옵션
- config file
- env var
- auto-discovery

로 해결해야 한다.

예:

- `ZIGRIX_HOME`
- `ZIGRIX_OPENCLAW_HOME`
- `ZIGRIX_PROJECT_ROOT`

### 6-2. agent ID 하드코딩 완화

현재는 `pro-zig`, `qa-zig`, `front-zig`, `back-zig`, `sys-zig`, `sec-zig` 중심이다.

이건 기본 preset으로는 좋지만,
공개용은 아래처럼 가야 한다.

- 기본 profile: `zig-default`
- user-defined agent map 가능
- 특정 OpenClaw 환경에선 preset import 가능

즉,
**하드코딩된 팀 구조 → configurable team profile** 전환이 필요하다.

### 6-3. pyproject 기반 패키징

v0.1부터 있어야 한다.

필수:
- `pyproject.toml`
- console_scripts entry point (`zigrix`)
- version module
- build recipe

권장:
- `hatchling` or `setuptools`
- 최소 Python 버전 명시
- test/lint 설정

### 6-4. install.sh 설계

설치 방식은 Python core 기준으로 아래가 가장 현실적이다.

#### 권장 방식

GitHub Release에 아래 아티팩트를 올린다.

- wheel (`.whl`)
- source tarball
- skills tarball (선택)
- checksums
- install.sh

`install.sh`는:

1. 플랫폼 감지
2. Python/uv 존재 확인
3. 전용 venv 생성 (`~/.local/share/zigrix/venv`)
4. release wheel 설치
5. `~/.local/bin/zigrix` 심볼릭 링크 생성
6. optional: OpenClaw skills copy/symlink

이 방식 장점:
- Python 프로젝트로 유지 가능
- 사용자는 `curl ... | sh` 혹은 다운로드 후 실행만 하면 됨
- 버전 업그레이드 관리 쉬움
- uninstall 경로도 명확함

### 6-5. OpenClaw skill pack 제공

v0.1부터 함께 제공해야 한다.

예상 구성:

```text
skills/
├─ zigrix-shared/
├─ zigrix-task-create/
├─ zigrix-task-start/
├─ zigrix-worker-prepare/
├─ zigrix-worker-register/
├─ zigrix-worker-complete/
├─ zigrix-evidence-merge/
└─ zigrix-task-finalize/
```

각 skill frontmatter 예시 방향:

```yaml
---
name: zigrix-task-create
version: 0.1.0
description: Create a Zigrix task and emit machine-readable metadata.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
---
```

포인트:
- OpenClaw는 `zigrix` 바이너리만 찾으면 됨
- 설치된 skill이 agent에게 사용법을 가르침
- plugin 없어도 충분히 agent 활용 가능

---

## 7. 공개 배포 관점에서 지금 가장 큰 설계 결정

### 결정 1. repo 이름/경계

현재 `orchestration/`는 구현 내용상 Zigrix지만,
외부 공개물은 **`zigrix`**라는 이름으로 명확하게 나가는 게 맞다.

권장:
- 새 공개 repo 이름: `zigrix`
- 현재 `orchestration/` 자산을 이 repo의 core로 흡수

### 결정 2. 런타임 데이터 위치

현재처럼 source repo 하위에 task ledger를 둘지,
project-local `.zigrix/`로 뺄지 결정해야 한다.

권장 답:
- **source repo와 runtime ledger 분리**
- 기본은 현재 작업 디렉토리 기준 `.zigrix/`

### 결정 3. OpenClaw 의존도

v0.1에서 Zigrix는 **OpenClaw 전용이면서도 OpenClaw 내부 코드에 묶이지 않는** 방향이 맞다.

즉:
- OpenClaw agents가 잘 쓰게 만든다
- 하지만 Zigrix 자체는 독립 CLI로 유지한다

### 결정 4. 제품 철학

Zigrix는 “개발 작업 오케스트레이터”인지,
아니면 더 넓게 “AI agent execution ledger / workflow CLI”인지 정해야 한다.

현재 자산은 전자에 더 가깝다.

v0.1은 범위를 좁히는 게 맞다.

> **권장 포지셔닝:**
> Zigrix = OpenClaw agent-oriented development orchestration CLI

이게 가장 명확하고, 현재 코드와도 잘 맞는다.

---

## 8. 추천 로드맵

## Phase 1 — 제품화 최소화 (강력 추천)

목표:
- 지금 자산을 portable CLI로 감싼다.
- plugin 없이 OpenClaw에서 쓰게 만든다.

해야 할 일:
- 절대경로 제거
- pyproject 추가
- `zigrix` entrypoint 추가
- commands 재매핑
- JSON output 정리
- `.zigrix/` state layout 설계
- `skills/zigrix-*` 작성
- `install.sh` + GitHub Release
- `zigrix doctor`

출시 결과:
- `zigrix` 설치 가능
- OpenClaw skills 연동 가능
- 다른 사람도 install.sh로 사용 가능

## Phase 2 — OpenClaw companion plugin

목표:
- OpenClaw 생태계 통합 강화

추가:
- `openclaw.plugin.json`
- `skills: ["./skills"]`
- `openclaw plugins install ...` 경로 지원
- optional config schema/uiHints

## Phase 3 — deeper integration

목표:
- session store / status / report 흐름 고도화

추가 후보:
- OpenClaw session introspection helper
- richer report templates
- dashboard/API
- non-OpenClaw backend adapters

---

## 9. 내가 보는 최종 추천안

### 추천 아키텍처

**정답은 이거다:**

1. Zigrix는 **독립 Python CLI**로 만든다.
2. 배포는 **GitHub Release + install.sh** 중심으로 간다.
3. OpenClaw 연동은 **pluginless skill pack + `zigrix` binary**로 먼저 붙인다.
4. plugin은 나중에 **선택형 companion layer**로 추가한다.

### 이 안이 좋은 이유

- 지금 코드 자산을 가장 덜 부수고 살릴 수 있음
- install UX가 단순함
- OpenClaw에 과도하게 종속되지 않음
- 외부 공개 후 유지보수 부담이 비교적 낮음
- gws 스타일의 “설치하면 에이전트가 쓸 수 있음”을 충분히 달성 가능

### 반대로 비추천하는 것

- v0.1부터 OpenClaw plugin 본체로 밀어넣기
- 현재 절대경로 구조를 유지한 채 포장만 바꾸기
- source repo와 runtime 데이터를 계속 섞어두기
- 사람 친화적인 텍스트 출력만 남기고 JSON 계약을 미루기

---

## 10. 바로 다음 액션 제안

다음 작업 순서는 이게 제일 좋다.

1. **CLI 제품 명세 확정**
   - command surface
   - state/config path
   - v0.1 범위

2. **현재 스크립트 → 새 명령 매핑표 작성**
   - migration spec

3. **repo scaffold 생성**
   - `pyproject.toml`
   - `src/zigrix/`
   - `skills/`
   - `install.sh`

4. **portable core로 1차 리팩터링**
   - 하드코딩 제거
   - state path abstraction

5. **OpenClaw skill pack 작성**
   - 최소 shared + task/worker/finalize 계열

6. **GitHub Release v0.1.0-alpha**
   - install.sh 검증

---

## 11. 한 줄 요약

지금 Zigrix는 **운영 로직은 이미 충분히 강하고**, 부족한 것은 **외부 배포 가능한 CLI 제품 레이어**다.

그래서 v0.1은 **독립 Python CLI + GitHub Releases + install.sh + OpenClaw skill pack**으로 가는 게 가장 맞다.
