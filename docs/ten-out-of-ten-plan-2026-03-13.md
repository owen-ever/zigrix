# Zigrix 10/10 오픈소스 CLI 달성 계획 (2026-03-13)

## 0. 현실 인식

현재 Zigrix는:

- **조사 품질:** 8.2 / 10
- **실행 가능한 설계안 성숙도:** 6.8 / 10
- **실제 오픈소스 공개 준비도:** 4.0 / 10

즉, 지금은 **좋은 설계 초안**이지, **완성도 높은 공개 CLI 제품**은 아니다.

이 문서의 목적은 이 상태를 **10/10 공개 CLI** 수준까지 끌어올리는 데 필요한
실행 계획 / 산출물 / 게이트 / 완료 기준을 정리하는 것이다.

---

## 1. 10/10의 정의

Zigrix를 10/10 공개 CLI라고 부르려면, 아래 조건을 모두 만족해야 한다.

### 제품
- 설치 후 `zigrix --help`, `zigrix doctor`, `zigrix init`가 즉시 동작
- 주요 명령군이 직관적이고 일관적임
- 기본 텍스트 출력과 `--json` 출력 모두 품질이 높음
- 에러 메시지가 다음 행동을 안내함

### 이식성
- 개인 로컬 경로에 묶이지 않음
- macOS/Linux에서 동작
- 최소 지원 Python 버전과 OS 범위가 명확함
- 프로젝트별 상태와 전역 설정이 분리됨

### 신뢰성
- 테스트가 있음
- golden path smoke test가 있음
- install / upgrade / uninstall / rollback 경로가 있음
- GitHub Releases 자산과 checksums가 있음

### 오픈소스 운영
- README, LICENSE, SECURITY, CONTRIBUTING, CHANGELOG 존재
- release policy와 support matrix 명시
- 이슈/PR 템플릿 또는 최소 정책 존재

### OpenClaw 사용성
- OpenClaw agent가 설치 여부를 확인 가능
- skill pack이 존재
- 설치 후 skill 사용 예제가 문서화됨

---

## 2. 최종 제품 방향 (아키텍처 고정안)

이 계획은 아래 결정을 **기본 고정안**으로 둔다.

### 제품 포지셔닝
> Zigrix = OpenClaw agent-oriented development orchestration CLI

### 구현 언어
- Python 유지

### 배포 전략
- 1차: **GitHub Releases + install.sh**
- 2차: **PyPI / pipx / uv tool install**
- 3차: 필요 시 Homebrew / companion plugin

### OpenClaw 연동
- v0.1~v1.0: **pluginless skill pack**
- v1.x 이후: optional companion plugin 검토

### 지원 범위
- v0.x / v1.0 우선 지원: **macOS + Linux**
- Windows: 명시적 후순위

### 상태 경로
- config: `~/.config/zigrix/`
- data: `~/.local/share/zigrix/`
- cache: `~/.cache/zigrix/`
- project runtime: `<repo>/.zigrix/`

### 라이선스 기본안
- `Apache-2.0` 우선 검토
- 단, 구현 직전 dependency/license 실사 후 확정

---

## 3. 현재 가장 큰 문제 10개

1. 절대경로 하드코딩
2. OpenClaw 특정 로컬 구조 의존
3. 스크립트 중심 구조라 CLI 제품 경계가 없음
4. `pyproject.toml` / console script 부재
5. JSON output / exit code 계약 부재
6. install.sh 미구현
7. release workflow 미구현
8. health files 부재
9. skill pack 미구현
10. 외부 사용자 관점 smoke test 미구현

이 10개를 해결하지 않으면 10/10은 절대 못 간다.

---

## 4. 작업 원칙

### 원칙 1. 개인 환경 의존 제거가 최우선
기존 자산 재사용보다, 공개 제품으로서의 이식성을 우선한다.

### 원칙 2. 명령 표면 먼저 고정
내부 리팩터링보다 먼저 `zigrix <group> <command>` 계약을 고정한다.

### 원칙 3. install/release는 부가 기능이 아니라 본체 일부
오픈소스 CLI에서 설치 실패는 제품 실패다.

### 원칙 4. OpenClaw 연동은 강하지만 분리는 명확하게
Zigrix는 OpenClaw 친화적이어야 하지만 OpenClaw 내부 구현에 종속되면 안 된다.

### 원칙 5. alpha 전엔 “멋있는 기능”보다 “망하지 않는 기본기”
새 기능보다 portable core, doctor, install, docs, tests가 우선이다.

---

## 5. Workstream 정의

## WS1. Core extraction
목표: 기존 orchestration 자산을 portable core로 추출

주요 산출물:
- `src/zigrix/`
- path/config abstraction
- runtime state abstraction
- OpenClaw adapter 경계 정의

## WS2. CLI UX / command contract
목표: 사용자와 에이전트가 사용할 공식 명령면 정의

주요 산출물:
- command tree
- `--json` schema
- exit code policy
- stderr/stdout policy

## WS3. Packaging / install / release
목표: 설치부터 릴리즈까지 제품 경로 완성

주요 산출물:
- `pyproject.toml`
- wheel/sdist build
- `install.sh`
- GitHub Actions build/release
- checksums / rollback policy

## WS4. OpenClaw integration
목표: OpenClaw agent가 설치 후 바로 쓰도록 함

주요 산출물:
- `skills/zigrix-*`
- install opt-in flow
- OpenClaw integration docs

## WS5. OSS repo operations
목표: 공개 repo로서 필요한 최소 운영 체계 구축

주요 산출물:
- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CHANGELOG.md`

## WS6. QA / hardening
목표: 실제 외부 배포 가능한 신뢰성 확보

주요 산출물:
- unit/integration/smoke tests
- golden path test matrix
- installer idempotency 검증
- uninstall / rollback 검증

---

## 6. Phase별 실행 계획

## Phase 0 — 제품 결정 고정

목표:
- 앞으로 바꾸면 안 되는 큰 결정을 확정한다.

완료 기준:
- repo 이름 확정
- 라이선스 방향 확정
- 지원 OS/Python 버전 확정
- 상태 경로 정책 확정
- 배포 채널 우선순위 확정

산출물:
- `docs/product-decisions.md`
- `docs/support-matrix.md`
- `docs/license-decision.md`

게이트:
- 이 단계가 안 끝나면 scaffold 금지

---

## Phase 1 — repo skeleton + portable architecture

목표:
- 현재 스크립트 묶음을 제품형 repo skeleton으로 옮긴다.

완료 기준:
- 아래 구조 존재

```text
zigrix/
├─ pyproject.toml
├─ README.md
├─ CHANGELOG.md
├─ LICENSE
├─ install.sh
├─ src/zigrix/
├─ tests/
├─ skills/
├─ docs/
└─ .github/workflows/
```

산출물:
- `pyproject.toml`
- `src/zigrix/cli.py`
- `src/zigrix/config.py`
- `src/zigrix/paths.py`
- `src/zigrix/runtime/`

핵심 작업:
- 절대경로 제거
- env/config 기반 path resolution 도입
- `.zigrix/` 프로젝트 상태 규약 도입

게이트:
- 하드코딩 경로 0개
- `python -m zigrix --help` 또는 동등 경로 동작

---

## Phase 2 — command contract freeze

목표:
- 공용 명령면과 JSON 계약을 고정한다.

권장 명령군:

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

산출물:
- `docs/cli-spec.md`
- `docs/json-contracts.md`
- `docs/error-codes.md`

완료 기준:
- 주요 명령 1차 표면 확정
- 각 명령의 input/output/error schema 문서화
- stdout/stderr policy 고정

게이트:
- 이후 breaking change는 명시적 decision 없이는 금지

---

## Phase 3 — feature parity with current orchestration

목표:
- 기존 핵심 기능을 새 CLI 표면으로 재구현한다.

대상 기능:
- task create
- task start
- worker prepare/register/complete
- evidence collect/merge
- finalize
- rebuild/status/stale

산출물:
- `src/zigrix/commands/*`
- migration notes

완료 기준:
- 현재 orchestration 주요 golden path를 새 CLI로 재현 가능
- 기존 스크립트 없이도 최소 end-to-end 흐름 가능

게이트:
- 1개 실제 task를 새 CLI만으로 생성→진행→종결 가능

---

## Phase 4 — install/release system

목표:
- “설치 가능한 제품”으로 만든다.

산출물:
- `install.sh`
- `docs/install.md`
- `docs/uninstall.md`
- GitHub Actions build workflow
- GitHub Actions release workflow

`install.sh` 필수 요구사항:
- idempotent
- version pin 지원
- `latest`는 명시 옵션일 때만 허용
- wheel 기반 설치
- 실패 시 중간 상태 최소화
- skill 설치 opt-in

릴리즈 자산:
- wheel
- sdist
- skills bundle
- install.sh
- checksums

게이트:
- 빈 macOS/Linux 환경에서 설치 성공
- install → upgrade → uninstall → reinstall 경로 검증

---

## Phase 5 — OpenClaw skill pack

목표:
- OpenClaw 에이전트가 설치 후 바로 Zigrix를 활용하게 만든다.

초기 skill 목록:
- `zigrix-shared`
- `zigrix-task-create`
- `zigrix-task-start`
- `zigrix-task-status`
- `zigrix-worker-prepare`
- `zigrix-worker-register`
- `zigrix-worker-complete`
- `zigrix-evidence-collect`
- `zigrix-evidence-merge`
- `zigrix-task-finalize`
- `zigrix-doctor`

완료 기준:
- `requires.bins: ["zigrix"]` 적용
- skill docs와 CLI docs가 충돌하지 않음
- OpenClaw integration 예제 제공

게이트:
- OpenClaw skill readiness 확인 가능
- 최소 1회 agent usage example 검증

---

## Phase 6 — repo health + security + contribution flow

목표:
- public repo 최소 건강상태 확보

산출물:
- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CHANGELOG.md`
- issue / PR templates

완료 기준:
- 외부 사용자가 README만 읽고 설치 가능
- 취약점 제보 경로 명확
- 기여 규칙이 과하지 않지만 명확함

게이트:
- “public but not actually usable” 상태 탈출

---

## Phase 7 — hardening / alpha gate

목표:
- alpha를 내도 욕만 먹고 끝나지 않게 만든다.

필수 테스트:
- unit tests
- integration tests
- CLI snapshot tests
- installer smoke tests
- JSON contract tests
- golden path e2e

alpha exit criteria:
- macOS/Linux smoke pass
- install/reinstall/uninstall pass
- docs 최소 완성
- known issues 목록 존재
- crash-level blocker 없음

릴리즈:
- `v0.1.0-alpha.1`

---

## Phase 8 — beta / external validation

목표:
- 실제 외부 사용 시나리오 검증

해야 할 것:
- 최소 2~3개 외부 환경 테스트
- 설치 피드백 수집
- README/doctor/error message 개선
- release notes 품질 개선

beta exit criteria:
- fresh install 성공률 높음
- docs 기반 self-serve 가능
- 가장 흔한 설치 실패 3개에 대한 복구 경로 확보

릴리즈:
- `v0.1.0-beta.1`

---

## Phase 9 — v1.0 gate

목표:
- “이제 공개 추천 가능” 상태 달성

v1.0 exit criteria:
- command contract 안정화
- install/release flow 안정화
- skill pack 안정화
- README / docs / examples 충분
- support matrix 명확
- 2회 이상 release cycle에서 치명적 installer 문제 없음

릴리즈:
- `v1.0.0`

---

## 7. 우선순위 규칙

### 절대 우선
1. portable paths
2. command contract
3. install/release
4. docs
5. tests

### 후순위
- fancy UI
- dashboard
- OpenClaw companion plugin
- Windows native polishing
- Homebrew tap
- binary packaging

즉, **v1.0 전에는 “예뻐 보이는 것”보다 “설치되고 안 망하는 것”이 우선**이다.

---

## 8. 문서 구조 제안

이 repo는 최소 아래 문서 체계를 가져야 한다.

### root
- `README.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`

### docs/
- `product-decisions.md`
- `cli-spec.md`
- `json-contracts.md`
- `error-codes.md`
- `architecture.md`
- `install.md`
- `uninstall.md`
- `openclaw-integration.md`
- `release-process.md`
- `support-matrix.md`

---

## 9. GitHub 운영 정리

권장 label:
- `kind:feature`
- `kind:bug`
- `kind:docs`
- `kind:release`
- `kind:installer`
- `kind:openclaw`
- `kind:breaking`
- `prio:p0`
- `prio:p1`
- `prio:p2`

권장 milestone:
- `M0 Foundations`
- `M1 Portable Core`
- `M2 CLI Contract`
- `M3 Install & Release`
- `M4 OpenClaw Skills`
- `M5 Alpha`
- `M6 Beta`
- `M7 v1.0`

---

## 10. 가장 먼저 해야 할 실제 액션

이 문서 기준으로 다음 순서가 맞다.

### 즉시 해야 할 5개
1. `product-decisions.md` 작성
2. `support-matrix.md` 작성
3. `cli-spec.md` 초안 작성
4. `pyproject.toml` + `src/zigrix/` scaffold 생성
5. 기존 orchestration에서 하드코딩 경로 목록 전수 추출

### 그 다음 5개
6. `install.sh` 상세 설계
7. `README.md` 초안
8. `LICENSE` 후보 확정
9. `SECURITY.md` / `CONTRIBUTING.md` 초안
10. 첫 golden path e2e 정의

---

## 11. 냉정한 기준선

이 계획을 다 따라도, 아직 구현 안 하면 점수는 안 오른다.

진짜 점수 상승 구간은:
- 문서 작성이 아니라
- **portable core 구현**
- **installer 동작 검증**
- **실제 release**
- **외부 환경 smoke test**

에서 나온다.

즉, 지금부터는 “조사”보다 **제품화 실행**이 핵심이다.

---

## 12. 한 줄 결론

Zigrix를 10/10 공개 CLI로 만들려면,
**좋은 조사 결과를 기반으로 한 문서 정리**가 아니라,
**portable core → CLI 계약 → installer/release → skill pack → hardening** 순서의 제품화 프로그램으로 움직여야 한다.

이 문서는 그 프로그램의 기준선이다.
