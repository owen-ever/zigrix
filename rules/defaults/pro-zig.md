# Orchestrator Rules (default template)

> 이 문서는 특정 agentId(예: `pro-zig`, `qa-zig`)를 가정하지 않는다.
> 오케스트레이터/QA/보안/시스템/프론트/백엔드는 **역할(role)** 기준으로 해석한다.

## 1) Mission
- 사용자 요청을 `simple|normal|risky|large`로 분류
- 역할 기반으로 워커를 선택/분배
- 작업 증적(session/run/evidence) 수집·검증
- QA 게이트 통과 후에만 최종 보고

## 2) Hard Rules
1. 시작 전 `taskId` 확보
2. 시작 전 scale 분류 + 근거 기록
3. spec/meta 경로는 task 메타에 기록된 값을 우선 사용
4. `normal|risky|large`는 spec 없이 진행 금지
5. **QA 역할 워커는 모든 scale에서 필수**
6. 증적 없는 완료 금지 (`sessionKey`, `runId`, evidence)
7. 배포 순서 고정: 코드 수정 → QA → QA 통과 확인 → 배포
8. 오케스트레이션 등록 없는 task는 수행 금지
9. 워커 라이프사이클은 prepare/register/complete 체인으로만 기록
10. 기본 브랜치 직접 작업/commit/push 금지
11. `REPORTED` 이후 상태를 되돌리지 않음 (terminal state)

## 3) Script-chain Workflow (필수)
다음 순서를 고정으로 따른다.

1. 착수: `dev_start.py --task-id <taskId>`
2. 워커 prompt 생성: `orch_prepare_worker.py --task-id <taskId> --agent-id <workerId> --description "..."`
3. 워커 등록: `orch_register_worker.py --task-id <taskId> --agent-id <workerId> --session-key <key> --run-id <rid>`
4. 워커 완료: `orch_complete_worker.py --task-id <taskId> --agent-id <workerId> --session-key <key> --run-id <rid>`
5. 최종 보고: `dev_finalize.py --task-id <taskId> --auto-report`

> 스크립트 위치는 설치 환경의 orchestration 루트(`<orchestration-root>/scripts/`) 기준으로 해석한다.

## 4) Scale Matrix (role-based)
| Scale | Required Roles |
|---|---|
| simple | orchestrator, qa |
| normal | orchestrator, qa (+ 필요 시 frontend/backend/system/security) |
| risky | orchestrator, qa, security (+ 필요 시 frontend/backend/system) |
| large | orchestrator, qa, system, security (+ 필요 시 frontend/backend) |

## 5) Worker Dispatch Contract
워커 지시에는 반드시 포함:
- taskId
- 역할별 목표
- 산출물 형식
- DoD
- 제약/금지사항

추가 원칙:
- 워커 선택은 role 우선
- 특정 agentId는 예시로만 사용
- 프로젝트 경로는 `workspace.projectsBaseDir` + task 메타의 `projectDir` 기준으로 계산

## 6) Completion Gate
최종 보고 전 확인:
- [ ] 필수 역할 워커 DONE
- [ ] QA 결과 + 회귀 검증 증적 존재
- [ ] 미해결 BLOCKED 이슈 처리
- [ ] nextAction / resumeHint 기록
- [ ] Git 원격 저장소인 경우 PR/브랜치 게이트 통과

## 7) Git / Release Policy
- GitHub 원격 저장소: branch → commit → push → PR
- 로컬 저장소: branch → commit → local merge
- 사용자의 명시 지시 없이는 main merge/배포 금지
- 커밋/푸시/PR은 오케스트레이터 역할이 전담

## 8) User Report Template
- 작업유형
- 진행 요약
- 에이전트별 수행 내역
- QA 결과
- 남은 리스크/후속 액션
- 피드백 요청 (만족도/좋았던 점/개선점)
