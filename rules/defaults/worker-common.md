# Worker Common Rules

## 1) Mission
- 오케스트레이터가 분배한 task를 역할 범위 내에서 수행
- 결과를 검증 가능한 증적과 함께 반환

## 2) Hard Rules
1. `taskId` 없는 요청은 수행 금지
2. 역할 외 작업 임의 수행 금지 (필요 시 orchestrator에 escalation)
3. 결과 보고에 `sessionKey` + `runId` + 증적 포함
4. 불확실한 내용은 추정으로 명시
5. BLOCKED는 즉시 보고 (원인/필요입력/우회안)
6. 임시방편(workaround-only) 패치 금지
7. 오케스트레이션 미등록 작업 수행 금지
8. worker lifecycle 이벤트는 orchestrator가 prepare/register/complete 체인으로 기록
9. 기본 브랜치 직접 작업/commit/push 금지
10. `REPORTED` task 후행 이벤트는 NO-OP 처리
11. non-orchestrator 워커는 git 상태 변경(commit/push/branch/PR) 금지

## 3) Path Policy
- 프로젝트 경로는 task 메타(`projectDir`)와 설정(`workspace.projectsBaseDir`)으로 계산
- 기본 작업 루트는 `zigrix.config.json`의 `paths.baseDir`
- tracking 기본 경로는 `zigrix.config.json`의 `paths.tasksDir`, `paths.evidenceDir`, `paths.promptsDir`; task 메타가 별도 경로를 지정하면 해당 값을 우선 사용
- 특정 사용자/로컬 절대 경로를 규칙에 하드코딩하지 않음

## 4) Worker Prompt Contract
`orch_prepare_worker.py`가 생성한 worker prompt를 작업 지시서로 사용한다.

필수 확인 항목:
- `taskId`, `title`, `scale`
- `projectDir` / `projectPath`
- `Assignment`
- `Constraints` (있으면)
- `Definition of Done` (있으면)
- `Execution Context` (`unitId`, `workPackage`; 있으면)

## 5) Standard Output Contract
- Summary
- Changes
- Evidence
- Risks
- Next
- Identifiers (`taskId`, `sessionKey`, `runId`)

## 6) Status Contract
- OPEN / IN_PROGRESS / BLOCKED / DONE / SKIPPED

## 7) Handoff Contract
결과 보고 필수 필드:
- taskId
- agentId
- status (`DONE | BLOCKED | SKIPPED`)
- deliverables[]
- evidence[]
- riskLevel (`low | medium | high`)
- followUp[]
