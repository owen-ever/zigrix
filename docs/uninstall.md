# Uninstall

## Remove Zigrix CLI

If installed with the default source-checkout installer:

```bash
rm -f ~/.local/bin/zigrix
rm -rf ~/.local/share/zigrix/venv
```

## Remove OpenClaw skill links

If installed with `--with-openclaw-skills`, remove linked skills manually:

```bash
rm -rf ~/.openclaw/skills/zigrix-shared
rm -rf ~/.openclaw/skills/zigrix-doctor
rm -rf ~/.openclaw/skills/zigrix-init
rm -rf ~/.openclaw/skills/zigrix-task-create
rm -rf ~/.openclaw/skills/zigrix-task-status
```

## Keep or remove project state

Project-local runtime state is stored in:

```text
<project>/.zigrix/
```

Remove it only if you intentionally want to discard Zigrix runtime data.
