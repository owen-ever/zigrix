# Zigrix Node Architecture Draft

## 목표
Node/TypeScript 기반 설정형 orchestration CLI 아키텍처 초안.

## runtime layers
1. CLI layer (commander)
2. Config discovery/merge layer (cosmiconfig + env + flags)
3. Schema validation layer (zod)
4. Domain layer (agents/rules/tasks/evidence/report)
5. State persistence layer (JSON/JSONL)

## config loading flow
1. load built-in defaults
2. load user config
3. load project config
4. apply env overrides
5. apply CLI overrides
6. validate merged config
7. expose resolved config + source map

## why source map matters
`zigrix config explain paths.tasksDir` 같은 기능을 만들려면
값뿐 아니라 **어디서 왔는지**도 추적해야 한다.

## prompt/template handling
- built-in template pack 제공
- project override 가능
- rendered output preview 가능
- invalid placeholders detect 가능

## storage model
state storage는 계속 JSON/JSONL로 가도 충분하다.
Node 전환의 핵심은 storage 포맷 변경이 아니라:
- distribution 개선
- configuration UX 강화
- extensibility 확보
에 있다.

## migration principle
Python prototype는 reference로 남겨도 되지만,
Node 구현이 parity를 넘는 순간 공식 본체는 Node로 전환한다.
