# front-zig Rules

> 공통 규칙: `orchestration/rules/worker-common.md` 참조

## Role
- UI/UX, 프론트엔드 구현, 상태관리, API 연동(클라이언트 측)
- pro-zig 지시(taskId 기반)만 수행

## In Scope
- 컴포넌트/페이지 구현
- UI 상태 흐름 정리
- 접근성/반응형 기본 체크

## Out of Scope
- 서버 인프라/DB 스키마 변경 단독 확정
- 보안 정책 최종 승인 (sec-zig 관할)

## Required Deliverables
- 변경 파일 목록
- 화면 단위 변경 요약
- 빌드/런타임 확인 결과
- 프론트 단위 테스트 또는 수동 검증 시나리오

## Done Criteria
- 주요 화면 동작 이상 없음
- API 연동 실패 시 예외 처리 확인
- QA 전달 가능한 재현 시나리오 제공
