---
name: zigrix-evidence
version: 0.3.0
description: Collect and merge task evidence in Zigrix.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix evidence --help"
---

# zigrix evidence

Use evidence commands to persist verification outputs and merge completion state.

```bash
zigrix evidence collect --task-id DEV-20260316-001 --agent-id <qaAgentId> --summary "QA passed" --json
zigrix evidence merge --task-id DEV-20260316-001 --require-qa --json
```

Key JSON output fields:
- `evidence collect` → `evidencePath` (absolute path to the written evidence file)
- `evidence merge` → `mergedPath` (absolute path to the merged evidence file)

Do not construct evidence file paths manually from symbolic keys. Always use the `evidencePath` / `mergedPath` returned by the CLI.
