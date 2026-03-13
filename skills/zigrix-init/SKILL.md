---
name: zigrix-init
version: 0.1.0
description: Initialize project-local Zigrix runtime state.
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
    cliHelp: "zigrix init --help"
---

# zigrix init

Creates `.zigrix/` runtime directories in the current project.

```bash
zigrix init
```

Use this at the start of a new Zigrix-enabled repository.
