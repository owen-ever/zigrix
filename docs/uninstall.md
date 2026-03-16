# Uninstall

## Remove Zigrix CLI

If installed via npm:
```bash
npm uninstall -g zigrix
```

If installed via `install.sh` (npm link):
```bash
cd /path/to/zigrix
npm unlink
```

Remove PATH symlink if onboard created one:
```bash
rm -f ~/.local/bin/zigrix
```

## Remove OpenClaw skill links

Onboard or `--with-openclaw-skills` creates symlinks in `~/.openclaw/skills/`:

```bash
rm -f ~/.openclaw/skills/zigrix-*
```

## Keep or remove global state

Zigrix runtime state is stored globally in:

```text
~/.zigrix/
```

This includes config, tasks, evidence, rules, and event logs.
Remove it only if you intentionally want to discard all Zigrix data.

```bash
rm -rf ~/.zigrix
```
