# 6-Agent Orchestration Rule Templates

이 폴더는 `pro-zig` 오케스트레이션 운영을 위한 **규칙 템플릿** 모음이다.

## 파일 구성
- `pro-zig.md` — 오케스트레이터 규칙 템플릿
- `worker-common.md` — 모든 워커 공통 규칙
- `front-zig.md` — 프론트엔드 워커 규칙
- `back-zig.md` — 백엔드 워커 규칙
- `sys-zig.md` — 시스템 설계 워커 규칙
- `sec-zig.md` — 보안 워커 규칙
- `qa-zig.md` — QA 워커 규칙

## 공통 운영 고정값
- Scale: `simple | normal | risky | large`
- QA: **모든 Scale 필수 포함**
- Session visibility: `all` (운영 규칙으로 통제)
- Thread mapping: `taskId` 기준 유연 매핑 (`primaryThreadId`, `relatedThreadIds[]`)
- 명세문서 경로: `orchestration/tasks/<taskId>.md`
- `normal|risky|large`: 명세문서 **미작성 시 진행 금지**
- `simple`: 요약형 spec 허용(동일 경로 파일)

## 적용 순서
1. `pro-zig.md`를 기준으로 작업 분류 + 작업 분배 수행
2. 각 워커는 `worker-common.md` + 자기 역할 파일을 함께 준수
3. 결과는 반드시 `taskId`/`sessionKey`/`runId` 증적을 포함
4. QA 게이트 통과 전 완료 보고 금지
