# Prompt Template Model

## 목적
`orchestration/rules/*.md`에 있는 프롬프트 성격의 내용을 Zigrix에서 설정 가능한 template asset으로 옮길 때 필요한 모델.

## source precedence
1. built-in template
2. `zigrix.config.json` override
3. CLI inline override (debug only)

## supported template kinds
- `workerPrompt`
- `finalReport`
- `progressMessage`
- `evidenceSummary`

## required metadata
```json
{
  "kind": "workerPrompt",
  "format": "markdown",
  "version": 1,
  "placeholders": ["taskId", "title", "scale", "agentId"],
  "body": "## Worker Assignment: {{taskId}}"
}
```

## validation
- unknown placeholder 금지
- required placeholder 누락 금지
- unsupported format 금지
- version missing 금지

## operations needed
- preview/render ✅
- diff against built-in
- rollback to built-in
- export/import

## why this matters
정책 rule만 설정화하고 프롬프트 텍스트를 하드코딩으로 남기면,
실제 운영에서 다시 코드 수정이 필요해져서 Zigrix의 목표와 충돌한다.
