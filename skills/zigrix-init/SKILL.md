---
name: zigrix-init
version: 0.2.0
description: "[DEPRECATED] Use zigrix onboard instead."
metadata:
  openclaw:
    requires:
      bins: ["zigrix"]
---

# Zigrix Init (Deprecated)

**Use `zigrix onboard` instead.**

`zigrix init` is a deprecated compatibility command. It creates a config file but does not perform PATH stabilization, skill registration, or agent import.

```bash
# Preferred
zigrix onboard --yes --json

# Legacy (deprecated)
zigrix init --yes --json
```
