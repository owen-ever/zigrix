# Zigrix Node Architecture Draft

## 목표
Node/TypeScript 기반 설정형 orchestration CLI 아키텍처 초안.

## runtime layers
1. CLI layer (commander)
2. Canonical config contract layer (`~/.zigrix/zigrix.config.json`)
3. Schema validation layer (zod)
4. Domain layer (agents/rules/tasks/evidence/report)
5. State persistence layer (JSON/JSONL)

## config loading flow
1. resolve the canonical config path: `~/.zigrix/zigrix.config.json`
2. load built-in defaults
3. read the single config file when it exists
4. validate the merged model
5. expose resolved config + normalized absolute paths

## why this matters
Zigrix no longer uses user/project/env/CLI config layering for core runtime discovery.
Bootstrap and runtime both start from the same fixed config file location, then read `paths.*` from that file.

## prompt/template handling
- built-in template pack 제공
- overrides are stored in `zigrix.config.json`
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
legacy prototype는 reference로 남길 수 있지만,
Node 구현이 parity를 넘는 순간 공식 본체는 Node로 전환한다.
