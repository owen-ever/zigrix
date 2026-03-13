# Installation

## Current foundation path (source checkout)

```bash
./install.sh
```

This will:
- create a dedicated virtual environment under `~/.local/share/zigrix/venv`
- install Zigrix into that environment
- expose `zigrix` at `~/.local/bin/zigrix`

## With OpenClaw skill install

```bash
./install.sh --with-openclaw-skills
```

This additionally symlinks implemented Zigrix skills into `~/.openclaw/skills/` when available.

## Verify

```bash
zigrix --version
zigrix doctor
zigrix init
```

## Future release install path

Primary release target is GitHub Releases. The final installer contract will support tagged release assets and version pinning.
