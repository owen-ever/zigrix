# Zigrix Roadmap

이 문서는 Zigrix를 **10점짜리 오픈소스 CLI**로 만들기 위한 상위 로드맵이다.

현재 판단:
- 조사 품질: 높음
- 방향성: 대체로 맞음
- 실제 공개 준비도: 낮음

즉, 지금 상태는 **좋은 설계 초안**이지 **곧 공개 가능한 제품**은 아니다.

## North Star

Zigrix는 아래 조건을 만족할 때 `10/10 open-source CLI`로 본다.

1. **Node/TypeScript 기반으로 빌드/배포가 쉬움**
2. **초기 setup에서 산출물 경로를 설정 가능**
3. **에이전트 registry와 orchestration participants를 분리 관리 가능**
4. **새 agent 참여/기존 agent 제외를 동적으로 처리 가능**
5. **정책 rule + 프롬프트 template rule을 설정으로 수정 가능**
6. **`zigrix doctor`와 `zigrix config validate`로 환경/설정 진단 가능**
7. **README만 읽어도 첫 성공 경험 가능**
8. **npm/GitHub Releases 기반 설치/업데이트/롤백 경로가 명확함**
9. **테스트/CI/릴리즈 자동화가 갖춰짐**
10. **외부 사용자가 설치해도 개인 로컬 환경 가정이 없음**

## Phase

- Phase A: Python prototype 동결 + Node 재설계
- Phase B: config-first Node skeleton
- Phase C: agent registry / participation model
- Phase D: rule + prompt editing engine
- Phase E: orchestration runtime migration
- Phase F: packaging / release hardening
- Phase G: beta / 외부 검증
- Phase H: v1.0 release

세부 계획은 아래 문서 참조:
- `docs/node-configurable-platform-plan-2026-03-13.md`
- `docs/node-architecture.md`
- `docs/config-schema.md`
- `docs/agent-model.md`
- `docs/rule-model.md`
- `docs/implementation-bootstrap-node.md`

구조 원칙:
- repository root = **Node/TypeScript sole implementation**
