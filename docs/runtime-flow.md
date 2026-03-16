# Runtime Flow

## Primary lifecycle
1. `zigrix onboard` (one-time human setup)
2. `zigrix task dispatch` (preferred) or `zigrix task create`
3. `zigrix worker prepare`
4. `zigrix worker register`
5. `zigrix worker complete`
6. `zigrix evidence collect`
7. `zigrix evidence merge`
8. `zigrix report render`
9. `zigrix task finalize` (preferred) or `zigrix task report`

## Minimal local happy path
For local smoke workflows, Zigrix can skip explicit worker dispatch and go straight from task creation to evidence collection and report rendering.

## Status transitions
- `OPEN`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE_PENDING_REPORT`
- `REPORTED`

## Recovery points
- `task stale --apply` marks timed-out in-progress tasks as blocked
- `reset state` wipes runtime state and rebuilds index
- `reset config` restores defaults for all or part of config
- `template reset` and `rule reset` recover targeted operator mistakes

## Evidence contract
Evidence is stored per-agent under `~/.zigrix/evidence/<taskId>/`. A merged view is written to `_merged.json` so downstream reporting has one stable input.

## Index contract
`~/.zigrix/index.json` is a derived file. It should be rebuildable at any time and must not become the only source of truth.
