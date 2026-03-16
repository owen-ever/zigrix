# Installation

## Product-direction note
The intended public flow is:

```text
install
  -> zigrix onboard
```

Meaning install should only make the CLI available; onboarding should complete the environment setup.

See `docs/onboarding-ownership-model.md` for the ownership model and `docs/product-decisions.md` for the accepted decisions.

## Current foundation path (source checkout)

```bash
./install.sh
```

This currently:
- runs `npm install`
- builds the Node/TypeScript CLI
- exposes `zigrix` via `npm link`

## Current OpenClaw skill install path

```bash
./install.sh --with-openclaw-skills
```

This additionally symlinks implemented Zigrix skills into `~/.openclaw/skills/` when available.

## Important gap in current alpha
Install is **not yet equivalent to onboarding**.

Current gaps include:
- gateway-visible PATH readiness for `zigrix`
- guaranteed OpenClaw skill registration by default
- interactive first-run setup for workspace, agents, and rule presets

These gaps are expected to move under `zigrix onboard`.

## Current verify flow
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

Primary release target is GitHub Releases plus `install.sh`, with `npm install zigrix` as the secondary public install path once onboarding and release flow stabilize.
