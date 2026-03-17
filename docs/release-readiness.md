# Release Readiness

## Goal
This document answers one question: can Zigrix be handed to an external user with a reasonable expectation of successful installation and first use?

## Required checks
- [x] `npm run test`
- [x] `npm run build`
- [x] `npm run smoke`
- [x] `npm run build:dashboard`
- [x] `bash scripts/release-smoke.sh`
- [x] `npm pack --dry-run`
- [x] docs map is current
- [x] known limitations documented
- [x] issue/PR templates present
- [x] changelog current
- [x] installer path documented

Status: **all automated release-readiness checks currently pass**.

## Manual review items
- are recovery commands obvious enough?
- does `zigrix doctor` give actionable output?
- does `zigrix state check` catch obvious runtime drift?
- can a new user find quickstart without reading source?
- do release assets match docs?

## Publish note
npm publish is intentionally manual for the next step. Tonight's goal is publish-ready packaging, not automatic registry release.

## One-command pre-publish gate
```bash
npm run publish:check
```

## Remaining human checks for tomorrow morning
- confirm final package name availability on npm
- confirm repository remote/homepage targets
- run `npm whoami`
- publish manually with `npm publish --access public`
