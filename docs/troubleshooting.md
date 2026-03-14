# Troubleshooting

## `zigrix doctor` says config is missing
Run:
```bash
zigrix init --yes
```
Or initialize a target project root explicitly.

## I broke a template
Reset just that template:
```bash
zigrix template reset workerPrompt --yes
```

## I changed a rule and want the default back
```bash
zigrix rule reset --path rules.completion --yes
```

## I want everything back to defaults
```bash
zigrix reset config --yes
```

## My state files are messy
Reset runtime state only:
```bash
zigrix reset state --yes
```

## The index looks stale
```bash
zigrix index-rebuild
```

## The CLI builds but a flow still feels wrong
Use these in order:
1. `npm run test`
2. `npm run smoke`
3. `bash scripts/release-smoke.sh`
4. `zigrix doctor`

## OpenClaw is not installed
Core Zigrix commands can still work. OpenClaw is optional for the local file-backed core.
