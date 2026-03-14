# Installation

## Current foundation path (source checkout)

```bash
./install.sh
```

This will:
- run `npm install`
- build the Node/TypeScript CLI
- expose `zigrix` via `npm link`

## With OpenClaw skill install

```bash
./install.sh --with-openclaw-skills
```

This additionally symlinks implemented Zigrix skills into `~/.openclaw/skills/` when available.

## Verify

```bash
zigrix --version
zigrix doctor
zigrix config validate --json
zigrix init --yes
zigrix run examples/hello-workflow.json --json
```

## Legacy Python note

The previous Python implementation remains under `legacy-python/` for migration reference only.
It is no longer the default install path.

## Future release install path

Primary release target is GitHub Releases. The release path will center on Node-built assets plus `install.sh`, with optional skill bundle support.
