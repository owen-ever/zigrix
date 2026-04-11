# `/oz` Routing Examples

These examples are here to anchor semantic routing. They are examples, not an exhaustive phrase list.

## Force delegate
- `/oz 로그인 세션 버그 고쳐`
- `/oz hand this to Zigrix and fix the auth flow`
- `/oz investigate why onboard is skipping skills`

Expected route: `delegate`

## Natural-language delegate
- `이거 맡겨`
- `이 작업 위임해라`
- `오케스트레이터로 넘겨서 처리해`
- `이건 네가 직접 하지 말고 Zigrix로 태워`
- `hand this off`
- `route this through Zigrix`
- `assign this to the orchestrator`

Expected route: `delegate`

## Direct execution
- `이건 네가 직접 해`
- `위임하지 말고 지금 네가 수정해`
- `don’t delegate this, do it yourself`

Expected route: `direct`

## Answer only
- `왜 task dispatch 다음에 sessions_spawn이 필요한데?`
- `현재 Zigrix/OpenClaw 통합 구조 설명해라`
- `what does zigrix onboard actually register?`

Expected route: `answer`

## Ambiguous but execution-oriented
- `로그인 버그 고쳐`
- `이 이슈 조사해서 정리해`
- `세션/thread 진입점 구조 정리하고 필요한 수정 진행해`

Default bias:
- if the surrounding context implies tracked orchestration / handoff, choose `delegate`
- if the surrounding context clearly asks the current agent to do it directly, choose `direct`
