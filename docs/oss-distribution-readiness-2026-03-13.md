# Zigrix 오픈소스 배포 가능 수준 조사 보강 (2026-03-13)

## 목적

이 문서는 단순히 “CLI로 만들 수 있나?”가 아니라,
**Zigrix를 공개 GitHub repo + GitHub Releases + install.sh 형태로 배포해도 되는 수준**을 만들기 위해
추가로 필요한 조건을 조사/정리한 것이다.

핵심 관점은 5가지다.

1. 배포 채널
2. 설치 UX
3. Python 패키징/엔트리포인트
4. OpenClaw 연동 방식
5. 오픈소스 운영 최소 요건 (라이선스/보안/문서/릴리즈 정책)

---

## 1. 외부 근거 요약

이번 보강에서 확인한 공식/준공식 근거:

### Python packaging / CLI
- Python Packaging User Guide
  - `pyproject.toml`의 `[build-system]`, `[project]`, `[project.scripts]`가 표준 경로
  - `console_scripts` 기반으로 설치 후 `zigrix` 명령 제공 가능
- Entry points specification
  - 설치 도구가 `console_scripts`를 shell command wrapper로 생성

### Python CLI 설치 방식
- Python Packaging Guide: stand-alone CLI 설치는 `pipx`를 권장하는 흐름이 강함
- pipx 공식 문서:
  - CLI 앱을 격리된 venv에 설치
  - PATH로 노출
  - 업그레이드/언인스톨이 쉬움
- uv 공식 문서:
  - `uv tool install` 도구 설치/격리 환경 지원
  - Python CLI 소비자 UX 관점에서 pipx와 비슷한 포지션

### GitHub Releases
- GitHub Docs: release는 tag 기반의 배포 단위이며 release asset 업로드 가능
- GitHub는 repo zip/tarball을 자동 제공
- release asset은 최대 1000개 / 개별 2GiB 제한
- GitHub Changelog(2025-06): 업로드된 release asset에 대해 **SHA256 digest 자동 노출**

### 오픈소스 라이선스/운영
- Open Source Guides:
  - public repo는 자동으로 open source가 아님
  - **LICENSE 파일이 있어야 실질적 오픈소스 배포 가능**
  - MIT / Apache-2.0 / GPLv3 등이 일반적
- GitHub Docs:
  - `SECURITY.md`를 두고 취약점 제보 정책을 명시 가능

### OpenClaw 연동
로컬 확인 기준:
- `openclaw plugins install <path-or-spec>` 지원
- plugin manifest의 `skills` 디렉토리 지원
- skill은 `metadata.openclaw.requires.bins` 기준으로 readiness 판정 가능
- `openclaw skills check`는 실제로 missing bins/config/env를 구분해 보여줌

즉, Zigrix는 OpenClaw에 붙이기 위해 꼭 plugin일 필요는 없고,
**설치된 `zigrix` 바이너리 + skill pack**만으로도 충분히 agent 사용성을 제공할 수 있다.

---

## 2. “오픈소스로 배포 가능”의 의미를 Zigrix에 맞게 재정의

Zigrix에서 말하는 “배포 가능 수준”은 최소한 아래를 만족해야 한다.

### 기술적 배포 가능
- 다른 사람 컴퓨터에서 설치 가능
- 특정 개인 로컬 경로에 묶이지 않음
- 설치/업데이트/삭제가 문서화됨
- 버전별 release asset이 존재함

### 제품적 배포 가능
- README만 읽어도 설치/사용 흐름 이해 가능
- 첫 실행 실패 시 self-diagnosis 경로가 있음 (`zigrix doctor`)
- 명령 결과가 에이전트/스크립트가 읽기 쉬운 JSON으로 제공됨

### 오픈소스 운영 가능
- 라이선스 명시
- 기여/버그 제보/보안 제보 경로 명시
- 릴리즈 정책/지원 범위 명시

### OpenClaw 생태계 사용 가능
- OpenClaw agent가 `zigrix` 존재 여부를 판단 가능
- skill 설치 후 사용법을 학습 가능
- 향후 plugin으로 확장할 수 있는 구조를 유지

---

## 3. 배포 채널 비교

## 옵션 A. GitHub Releases + install.sh + isolated venv (권장 1순위)

구조:
- GitHub Release에 wheel / sdist / skills bundle / checksums / install.sh 업로드
- install.sh가 전용 venv를 만들고 `zigrix`를 설치
- `~/.local/bin/zigrix` 또는 XDG bin 경로에 링크

장점:
- 사용자가 제일 이해하기 쉬움
- Python을 직접 아는 사람/모르는 사람 모두 상대적으로 수용 가능
- PyPI 선행 없이도 배포 가능
- 버전별 재현성이 좋음
- install.sh에서 OpenClaw skill 설치까지 같이 처리 가능

단점:
- 설치 스크립트 유지보수가 필요
- shell 환경 차이를 흡수해야 함
- Windows 지원은 별도 전략 필요

판단:
- **초기 오픈소스 공개용으로 가장 현실적**

## 옵션 B. PyPI + pipx/uv tool install (권장 2순위)

구조:
- `pipx install zigrix` 또는 `uv tool install zigrix`
- PyPI 배포 전제

장점:
- Python CLI 표준 소비 UX에 가까움
- 업데이트/언인스톨이 매우 깔끔함
- release automation과 궁합이 좋음

단점:
- package name 확보 필요
- 초기에는 PyPI 퍼블리싱/이름 충돌/신뢰 문제 고려 필요
- OpenClaw skill 설치는 별도 단계가 될 수 있음

판단:
- **v0.2 또는 병행 채널로 매우 좋음**
- 하지만 “install.sh 중심”이라는 현재 요구에는 보조 채널이 더 맞음

## 옵션 C. standalone binary (PyInstaller/Nuitka 등)

구조:
- macOS/Linux/Windows별 단일 실행 파일 배포

장점:
- Python 설치 없는 UX 가능
- 설치 진입장벽 낮음

단점:
- 빌드 복잡도 급상승
- 사이즈 증가
- 플랫폼별 이슈 증가
- 디버깅/패키징 복잡성 커짐

판단:
- **v0.1 비추천**
- 나중에 채택 가능하지만 초기 배포에는 무거움

## 옵션 D. Homebrew tap

장점:
- macOS 사용자 UX 우수
- 업데이트 경로 명확

단점:
- formula 유지 비용 발생
- Linux/Windows 커버 안 됨
- install.sh 요구를 대체하지 못함

판단:
- **후속 채널로는 좋지만 초기 핵심 채널은 아님**

---

## 4. Zigrix v0.1 배포 권장안

가장 균형 좋은 조합은 이거다.

### 4-1. 본체
- Python package (`pyproject.toml`)
- `console_scripts`로 `zigrix` 명령 제공

### 4-2. 릴리즈 자산
GitHub Release asset 권장 구성:

- `zigrix-<version>-py3-none-any.whl`
- `zigrix-<version>.tar.gz`
- `zigrix-skills-<version>.tar.gz`
- `install.sh`
- `checksums.txt`

선택:
- `install.ps1` (Windows 초안)
- `SBOM` 또는 provenance (후속)

### 4-3. 설치 방식
`install.sh` 권장 동작:

1. OS/arch 감지
2. Python 존재 확인
3. `uv` 또는 `python -m venv` 사용 여부 결정
4. 전용 설치 디렉토리 생성
   - 예: `~/.local/share/zigrix/venv`
5. wheel 설치
6. `~/.local/bin/zigrix` 링크 생성
7. optional: OpenClaw skills 설치
   - 예: `~/.openclaw/skills/zigrix-*`
8. 마지막에 `zigrix doctor` 실행 안내

### 4-4. 설치 위치 정책
권장 기본값:

- config: `~/.config/zigrix/`
- data: `~/.local/share/zigrix/`
- cache: `~/.cache/zigrix/`
- user bin: `~/.local/bin/`
- project state: `<project>/.zigrix/`

이건 pipx/uv/XDG 생태계와도 방향이 맞다.

---

## 5. 오픈소스 공개 전에 꼭 갖춰야 할 repo 구성

이건 중요하다.

CLI 코드만 있어선 부족하고, repo가 공개용 최소 체계를 갖춰야 한다.

## 필수
- `README.md`
- `LICENSE`
- `pyproject.toml`
- `CHANGELOG.md` 또는 release notes 정책
- `install.sh`
- `skills/`
- `src/zigrix/`
- 테스트 디렉토리

## 강력 권장
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `docs/architecture.md`
- `docs/openclaw-integration.md`
- `docs/install.md`
- `docs/uninstall.md`

## 선택
- `.github/ISSUE_TEMPLATE/`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `CODEOWNERS`
- `SUPPORT.md`

---

## 6. 라이선스 관점 판단

오픈소스 공개에서 **라이선스 부재는 사실상 배포 불가**에 가깝다.

현재 Zigrix에는 적어도 아래 중 하나를 빠르게 정해야 한다.

### MIT
장점:
- 가장 단순
- 채택 장벽이 낮음
- agent/automation 쪽 도입이 빠름

단점:
- 특허 명시가 약함

### Apache-2.0
장점:
- 특허 라이선스 조항이 명시적
- 기업/협업 관점에서 더 안정적이라고 느끼는 경우 많음

단점:
- MIT보다 약간 무거움

### 내 판단
Zigrix는 에이전트 orchestration / automation 도구라서,
**Apache-2.0이 약간 더 어울린다**고 본다.

이유:
- 기업/오픈소스 도입 장벽 완화
- 특허 조항 측면에서 설명이 쉬움
- OpenClaw/gws 계열 프로젝트들과 분위기가 맞음

다만 “최대한 가볍게 빠르게 퍼뜨리는 것”이 우선이면 MIT도 충분히 가능.

---

## 7. 보안/신뢰성 관점에서 release에 필요한 것

install.sh 방식은 편하지만, 동시에 사용자 입장에선 가장 민감하다.
그래서 릴리즈 신뢰성을 같이 설계해야 한다.

### v0.1 최소 권장
- versioned release tag
- immutable release asset 이름 규칙
- `checksums.txt` 제공
- install.sh가 **버전 고정 다운로드**를 기본으로 함
- latest 설치는 명시 옵션으로만 허용

### v0.1.1+ 권장
- GitHub release digest 안내
- `zigrix version --json`
- `zigrix self-check` 또는 `zigrix doctor`

### v0.2+ 권장
- artifact signing / provenance
- SBOM
- CI에서 release smoke test

중요 포인트:
**install.sh가 main branch raw 파일을 무조건 가져오면 안 좋다.**
반드시 **release tag/asset 기준**으로 내려받는 게 맞다.

---

## 8. OpenClaw 연동을 오픈소스 배포 수준으로 끌어올리려면

## 8-1. v0.1 권장 방식: pluginless skill pack

구성 예:

```text
zigrix/
├─ src/zigrix/
├─ skills/
│  ├─ zigrix-shared/
│  ├─ zigrix-task-create/
│  ├─ zigrix-task-start/
│  ├─ zigrix-worker-prepare/
│  ├─ zigrix-worker-register/
│  ├─ zigrix-worker-complete/
│  ├─ zigrix-evidence-collect/
│  ├─ zigrix-evidence-merge/
│  └─ zigrix-task-finalize/
└─ install.sh
```

각 skill은 최소한:
- 무엇을 하는지
- 언제 쓰는지
- `zigrix` CLI 예시
- write/delete 계열 safety note
를 포함해야 함.

frontmatter는 대략 아래 형식이 적합:

```yaml
---
name: zigrix-task-create
version: 0.1.0
description: Create a Zigrix task and return machine-readable metadata.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
---
```

이 장점은 명확하다.

- OpenClaw에서 readiness 체크 가능
- Zigrix 본체는 여전히 독립 CLI
- skill 업데이트와 CLI 업데이트를 같이 배포 가능

## 8-2. v0.2 이후: companion plugin

추후에는 아래도 가능하다.

- `openclaw.plugin.json`
- `skills: ["./skills"]`
- optional config schema
- OpenClaw plugin install/update 흐름 연계

하지만 이건 초기에 필수는 아니다.

---

## 9. CI/CD까지 포함한 “배포 가능한 수준” 체크리스트

다음 체크리스트를 통과하면 “오픈소스 배포 준비됨”이라고 볼 수 있다.

### A. 제품 구조
- [ ] `pyproject.toml` 존재
- [ ] `zigrix` console script 제공
- [ ] 절대경로 제거
- [ ] XDG/project-local state 정책 확정
- [ ] `--json` 출력 지원
- [ ] exit code 규약 문서화

### B. 설치/업데이트
- [ ] `install.sh` 존재
- [ ] 설치 경로 문서화
- [ ] upgrade 경로 문서화
- [ ] uninstall 경로 문서화
- [ ] `zigrix doctor` 존재

### C. OpenClaw 연동
- [ ] skill pack 존재
- [ ] `requires.bins: ["zigrix"]` 사용
- [ ] install.sh에서 skill 설치 옵션 제공
- [ ] OpenClaw integration 문서 존재

### D. 오픈소스 운영
- [ ] LICENSE
- [ ] README
- [ ] CONTRIBUTING.md
- [ ] SECURITY.md
- [ ] CHANGELOG 또는 release notes 정책

### E. 릴리즈 품질
- [ ] GitHub Actions 테스트
- [ ] GitHub Release 생성 자동화
- [ ] wheel + sdist 생성
- [ ] checksums 제공
- [ ] macOS/Linux smoke test

### F. 제품 신뢰성
- [ ] telemetry 기본 off 또는 명확한 고지
- [ ] secrets/log redaction 정책 문서화
- [ ] error message가 action-oriented
- [ ] unsupported environment 판별이 명확

---

## 10. Zigrix에 대한 현실적 권장 로드맵 (보강판)

## Phase 0 — 공개 준비 설계
- repo 이름/라이선스 확정
- support matrix 확정 (macOS, Linux 우선 / Windows 후순위)
- 명령 표면 확정
- state path 정책 확정

## Phase 1 — portable CLI화
- 절대경로 제거
- `src/zigrix/`로 리팩터링
- `pyproject.toml` 작성
- `zigrix` console script 제공
- JSON output 계약 정리

## Phase 2 — 오픈소스 최소 운영 체계
- README / LICENSE / CONTRIBUTING / SECURITY
- install.sh
- GitHub Actions test/build/release
- release notes template

## Phase 3 — OpenClaw skill pack
- `skills/zigrix-*`
- install.sh에 optional skill 설치 포함
- OpenClaw integration 문서

## Phase 4 — 첫 공개 릴리즈
- `v0.1.0-alpha`
- GitHub Release asset 5종 업로드
- 설치 smoke test
- OpenClaw agent usage example 제공

## Phase 5 — 후속 배포 채널
- PyPI publish
- `pipx install zigrix`
- `uv tool install zigrix`
- Homebrew tap 검토
- companion plugin 검토

---

## 11. 최종 권장안

이번 보강 조사까지 포함한 최종 결론은 아래다.

### 최적의 초기 공개 전략

**Zigrix v0.1 공개 전략**

- 본체: **독립 Python CLI**
- 1차 배포 채널: **GitHub Releases + install.sh**
- 2차 배포 채널: **PyPI (후속)**
- OpenClaw 연동: **pluginless skill pack**
- 라이선스: **Apache-2.0 우선 검토**
- 지원 플랫폼: **macOS + Linux 우선**

### 이유

이 전략이:
- 현재 코드 재활용률이 높고
- 설치 UX가 단순하고
- OpenClaw 연동이 충분하며
- 오픈소스 운영 비용이 과도하게 커지지 않고
- 이후 PyPI / plugin / Homebrew로 확장도 쉽다

즉, “공개 가능”과 “현실적으로 유지 가능”의 균형점이 가장 좋다.

---

## 12. 지금 당장 결정해야 하는 항목

다음 6개는 더 미루지 않는 게 좋다.

1. repo 이름: `zigrix`로 갈지
2. license: MIT vs Apache-2.0
3. 최소 지원 OS: macOS/Linux만 먼저 갈지
4. 최소 지원 Python 버전: 3.10+ 또는 3.11+
5. 설치 방식 기본값: install.sh 내부 venv vs pipx bootstrap
6. OpenClaw skill 설치를 기본 on으로 할지 opt-in으로 할지

---

## 13. 내 추천 답

내 추천은 이거다.

- repo: `zigrix`
- license: `Apache-2.0`
- Python: `>=3.10` 또는 가능하면 `>=3.11`
- OS: `macOS + Linux` 우선
- install 기본: **install.sh + app-owned venv**
- OpenClaw skill 설치: **옵션 제공, 설치 중 yes/no 선택**

이렇게 가면 초기 릴리즈가 가장 덜 삐끗한다.
