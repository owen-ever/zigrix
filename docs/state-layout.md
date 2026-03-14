# State Layout

## Directory shape
```text
.zigrix/
├─ tasks/
│  └─ TASK-YYYYMMDD-NNN.json
├─ prompts/
├─ evidence/
│  └─ TASK-YYYYMMDD-NNN/
│     ├─ <agent>.json
│     └─ _merged.json
├─ runs/
│  └─ run-*.json
├─ tasks.jsonl
└─ index.json
```

## Source-of-truth files
- `tasks/*.json`: task records
- `tasks.jsonl`: append-only event ledger
- `evidence/<taskId>/*.json`: per-agent evidence

## Derived files
- `index.json`
- `_merged.json`
- rendered prompts under `prompts/`
- workflow run records under `runs/`

## Operator guidance
- If `index.json` looks wrong, rebuild it.
- If one template/rule is broken, reset that subtree instead of nuking the whole config.
- If local runtime state is irrecoverably messy, `reset state --yes` is the clean fallback.
