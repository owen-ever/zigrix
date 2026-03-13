---
name: zigrix-doctor
version: 0.1.0
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

Returns Python, path, binary, and OpenClaw-home readiness details.
