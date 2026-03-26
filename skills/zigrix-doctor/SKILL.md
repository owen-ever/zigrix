---
name: zigrix-doctor
version: 0.2.0
description: Inspect Zigrix environment readiness and OpenClaw integration prerequisites.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix doctor --help"
---

# zigrix doctor

Run this before debugging install or integration issues.

```bash
zigrix doctor --json
```

Returns environment, path, binary, and OpenClaw-home readiness details.

For resolved runtime paths only, prefer `zigrix path list --json` or `zigrix path get <key> --json`.
