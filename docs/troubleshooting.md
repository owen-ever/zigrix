# Troubleshooting

## `zigrix doctor` says config is missing
Run:
```bash
zigrix onboard --yes
```
Then re-check:
```bash
zigrix doctor
```

If you already onboarded before, rerun targeted setup:
```bash
zigrix configure --section agents --section skills --section path --yes
```

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

## `zigrix dashboard` says port is already in use
Use another port explicitly:
```bash
zigrix dashboard --port 3939
```

## `zigrix dashboard` fails with packaging error (`dist/dashboard` missing)
Rebuild dashboard bundle and retry:
```bash
npm run build:dashboard
zigrix dashboard
```

## OpenClaw is not installed
Core Zigrix commands can still work. OpenClaw is optional for the local file-backed core.
