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
rm -f ~/.openclaw/skills/oz ~/.openclaw/skills/zigrix-*
```

## Keep or remove global state

Zigrix runtime state is stored under the directory pointed to by `zigrix.config.json` (`paths.baseDir`). This includes tasks, evidence, rules, and event logs. The config file itself lives at `~/.zigrix/zigrix.config.json`.
Remove runtime state only if you intentionally want to discard all Zigrix data.

```bash
# inspect paths.baseDir first, then remove that directory if you really want a full wipe
zigrix config get paths.baseDir --json
```
