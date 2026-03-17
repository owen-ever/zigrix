# Installation

## Product-direction note
The intended public flow is:

```text
install
  -> zigrix onboard
  -> done
```

Install makes the CLI available. Onboarding completes environment setup including PATH stabilization, skill registration, and agent import.

See `docs/onboarding-ownership-model.md` for the ownership model and `docs/product-decisions.md` for the accepted decisions.

## Prerequisites: Node.js version

Zigrix requires Node.js **22 or later**.

```bash
node --version   # must print v22.x or higher
```

If you use **nvm**, activate the correct version before installing:

```bash
nvm use 22        # or: nvm use --lts
node --version    # confirm v22+
```

> **nvm + npm link note:** `npm link` binds the `zigrix` binary to the Node version that is active at the time `npm link` runs.
> If you later switch node versions (e.g. `nvm use 20`), the linked binary may break.
> Always run `npm run build && npm link` again after switching node versions.

## From source checkout

```bash
./install.sh
zigrix onboard
```

`install.sh` performs:
- `npm install`
- `npm run build`
- `npm link` (exposes `zigrix` globally)

### With OpenClaw skills (legacy flag)

```bash
./install.sh --with-openclaw-skills
```

Note: `zigrix onboard` now handles skill registration automatically when OpenClaw is detected. The `--with-openclaw-skills` flag remains for backward compatibility.

## What onboard does

`zigrix onboard` covers:
1. Creates `~/.zigrix/` base directory and default config
2. Detects OpenClaw (`~/.openclaw/`) and reads `openclaw.json`
3. Imports agents (filters out `main`, registers with roles)
4. Seeds rule files from `orchestration/rules/`
5. **PATH stabilization** — if `zigrix` isn't in PATH, creates a symlink in `~/.local/bin/`
6. **Skill registration** — symlinks `skills/zigrix-*` into `~/.openclaw/skills/`

## Verify flow
```bash
zigrix --version           # should match version in package.json
zigrix doctor
zigrix config validate --json
```

### Version mismatch

If `zigrix --version` shows an unexpected version after updating the source:

```bash
cd /path/to/zigrix
npm run build && npm link
zigrix --version   # should now be correct
```

## Reconfigure after install
```bash
zigrix configure            # all sections
zigrix configure --section agents   # just agents
zigrix configure --section skills   # just skills
```

## Legacy Python note

The previous Python implementation remains under `legacy-python/` for migration reference only.
It is no longer the default install path.

## Future release install path

Primary release target is GitHub Releases plus `install.sh`, with `npm install -g zigrix` as the secondary public install path once onboarding and release flow stabilize.
