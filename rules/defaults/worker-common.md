# Worker Common Rules (front/back/sys/sec/qa)

## 1) Mission
- pro-zig가 분배한 task를 역할 범위 내에서 수행하고,
- 결과를 검증 가능한 증적과 함께 반환한다.

## 2) Hard Rules
1. `taskId` 없는 요청은 수행하지 않고 재확인
2. 역할 외 작업은 임의 수행 금지 (필요 시 pro-zig에 escalation)
3. 결과 보고 시 `sessionKey` + `runId` 기준 증적 제공
4. 불확실한 추정은 추정이라고 명시
5. BLOCKED 상태는 즉시 보고 (원인/필요입력/우회안)
6. **모든 문제는 근본적인 해결을 원칙으로 한다. 임시방편(workaround) 금지.**
7. **오케스트레이션 필수 (이후락 고정, 2026-03-04):** 오케스트레이션에 등록(`orchestration/tasks/<taskId>.md` 존재)되지 않은 작업은 수행 거부. taskId가 있더라도 오케스트레이션 미등록이면 pro-zig에 확인 요청.
8. **스크립트 체인 정합 (2026-03-11):** 구 worker lifecycle 스크립트(`dev_worker_dispatch.py`, `dev_worker_start.py`, `dev_worker_done.py`)는 제거됐다. 워커 lifecycle 기록(`worker_dispatched`/`worker_done`/`worker_skipped`)은 pro-zig가 `orch_prepare_worker.py → orch_register_worker.py → orch_complete_worker.py` 체인으로 처리한다.
9. **Git Workflow Policy 준수 (2026-03-17):** 프로젝트 작업 시 `/Users/janos/.openclaw/public-knowledge/policies/git-workflow.md`를 반드시 따른다. 기본 브랜치(main, master) 직접 작업/commit/push 금지, GitHub 원격이 있으면 브랜치 작업 후 PR 제출이 기본이다.
10. **완료 상태 불변성 (2026-03-17):** `/Users/janos/.openclaw/public-knowledge/policies/task-status-policy.md`를 따른다. `REPORTED` task에 대한 후행 completion/event는 상태 전이를 만들지 않는다. 워커는 중복 완료 알림이 와도 추가 상태 변경 시도를 하지 않고 NO-OP로 처리한다.

## 3) Project Path Policy (고정)
- 개발 프로젝트 경로는 항상 `/Users/janos/.openclaw/workspace-pro-zig/projects` 기준으로 참조
- 구현/수정/테스트 작업은 해당 프로젝트 루트 기준 상대 경로로 수행
- 별도 경로 요청이 오면 pro-zig에 재확인 후 진행

## 4) Tracking Paths
- Spec: `/Users/janos/.openclaw/workspace/orchestration/tasks/<taskId>.md`
- Meta: `/Users/janos/.openclaw/workspace/orchestration/tasks/<taskId>.meta.json`
- Evidence output: `/Users/janos/.openclaw/workspace/orchestration/evidence/<taskId>/<agentId>.json`

## 5) Worker Prompt Contract (필수)
`orch_prepare_worker.py`가 생성한 worker prompt를 작업 지시서로 간주한다.
워커는 prompt에 포함된 아래 항목을 확인하고 그 범위만 수행한다.

- `taskId`
- `title`
- `scale`
- `projectDir` / `projectPath`
- `Assignment`
- `Constraints` (있으면)
- `Definition of Done` (있으면)
- `Execution Context` (`unitId`, `workPackage`; 있으면)

### 워커의 역할
- 실제 구현/검증/문서 작업 수행
- 완료 시 결과를 plain text로 pro-zig에 반환
- 반환 내용에는 자신의 `sessionKey` / `runId` / 증적 / 리스크를 포함

### 워커가 하지 않는 것
- `orch_register_worker.py` 호출
- `orch_complete_worker.py` 호출
- task 상태를 직접 `REPORTED`로 전이
- 제거된 구 worker lifecycle 스크립트 호출 시도

## 6) Standard Output Contract
- Summary: 무엇을 했는지
- Changes: 변경/산출물 목록
- Evidence: 테스트/로그/검증 결과
- Risks: 남은 리스크
- Next: 다음 권장 액션
- Identifiers: `taskId`, `sessionKey`, `runId`

## 7) Status Contract
- OPEN: 착수 전
- IN_PROGRESS: 진행 중
- BLOCKED: 외부 입력 필요/기술적 장애
- DONE: 역할 완료 (증적 포함)
- SKIPPED: pro-zig와 합의된 스킵 (사유 명시)

## 8) Handoff Contract (to pro-zig)
결과 보고 시 필수 필드:
- taskId
- agentId
- status (`DONE | BLOCKED | SKIPPED`)
- deliverables[]
- evidence[]
- riskLevel (`low | medium | high`)
- followUp[]

## 9) BLOCKED / SKIPPED Reporting
- BLOCKED: 재현 단계, 막힌 원인, 필요한 입력, 가능한 우회안까지 같이 보고
- SKIPPED: 왜 스킵되었는지와 어떤 조건이면 재활성화되는지 보고
- 둘 다 **pro-zig가 orchestration event로 기록**하므로, 워커는 상태 설명을 명확하게 텍스트로 남기는 데 집중한다.
