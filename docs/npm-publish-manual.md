# Manual npm Publish Runbook

_Last updated: 2026-03-14_

## Intent
npm publish is intentionally manual for the first release. This runbook is the final checklist to execute tomorrow morning.

## Preconditions
- npm account authenticated: `npm whoami`
- package name confirmed available or intentionally chosen
- repository remote finalized
- working tree clean
- all release-readiness checks green

## 1) Verify package metadata
```bash
cat package.json
npm pkg get name version private license
```
Expected:
- `private` is `false` or absent
- `name` is the intended publish name
- `version` matches the release tag target

## 2) Final local verification
```bash
npm run test
npm run build
npm run smoke
bash scripts/release-smoke.sh
npm pack --dry-run
node dist/index.js state check --json
```

## 3) Check package name availability
```bash
npm view <package-name> version
```
If a version is returned, the name is already taken.

## 4) Tag alignment
```bash
git status --short
git log --oneline -5
git tag
```
Create the intended tag only after the above checks pass.

## 5) Publish
```bash
npm publish --access public
```

## 6) Verify after publish
```bash
npm view <package-name> version
npm view <package-name> dist-tags
```

## If publish fails
- do not force-repeat blindly
- inspect the exact npm error first
- if the name is taken, rename before retrying
- if auth/2FA fails, fix auth before reattempting
- if metadata is wrong, patch package.json and repack first
