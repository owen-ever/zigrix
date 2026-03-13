# Zigrix Rule Model

## 목적
오케스트레이션 정책뿐 아니라 프롬프트 템플릿까지 설정으로 다룬다.

## rule의 두 층

### A. policy rules
예:
- scale별 required roles
- QA mandatory 여부
- completion gate
- stale policy
- reporting policy

### B. text/template rules
예:
- worker prompt
- final report
- progress message template
- evidence summary template

## 왜 둘 다 rule인가
실제 운영에서 `orchestration/rules/*.md`는 단순 문서가 아니라:
- 정책을 설명하고
- 행동을 유도하며
- 출력 형식을 사실상 고정하는 프롬프트 역할을 한다.

그래서 Zigrix에서는 이것을 **설정 가능한 rule asset**으로 다뤄야 한다.

## template requirements
- built-in defaults 제공
- project override 허용
- placeholder whitelist 검증
- preview/render 지원
- diff 지원
- rollback 가능

## placeholder examples
- `{{taskId}}`
- `{{title}}`
- `{{scale}}`
- `{{agentId}}`
- `{{requiredRoles}}`
- `{{workPackage}}`
- `{{unitId}}`

## 예상 명령
- `zigrix rule list`
- `zigrix rule get <path>`
- `zigrix rule set <path> <json>`
- `zigrix rule edit template.workerPrompt`
- `zigrix rule validate`
- `zigrix rule render template.workerPrompt --context context.json`
- `zigrix rule diff`

## validation
- unknown placeholders 차단
- required placeholders 누락 차단
- format mismatch 차단
- invalid policy references(role not found, agent not found) 차단
