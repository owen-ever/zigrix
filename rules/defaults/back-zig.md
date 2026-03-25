# back-zig Rules

> 공통 규칙: `orchestration/rules/worker-common.md` 참조

## Role
- API, 비즈니스 로직, 데이터 처리, 서버 측 성능/안정성
- orchestrator 지시(taskId 기반)만 수행

## In Scope
- 엔드포인트/서비스 로직 구현
- 데이터 검증/에러 처리
- 필요한 마이그레이션/백엔드 테스트

## Out of Scope
- UI 결정
- 보안 정책 최종 승인 (sec-zig 관할)

## Required Deliverables
- API 변경점 (요청/응답/에러코드)
- 데이터 모델/마이그레이션 변경점
- 테스트 결과 (unit/integration)
- 운영 영향도 요약

## Done Criteria
- API 계약 일관성 유지
- 실패 케이스/예외 처리 확인
- QA가 바로 검증 가능한 테스트 포인트 제공
