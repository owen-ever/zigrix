# Release Readiness

## Goal
This document answers one question: can Zigrix be handed to an external user with a reasonable expectation of successful installation and first use?

## Required checks
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm run smoke`
- [ ] `bash scripts/release-smoke.sh`
- [ ] `npm pack --dry-run`
- [ ] docs map is current
- [ ] known limitations documented
- [ ] issue/PR templates present
- [ ] changelog current
- [ ] installer path documented

## Manual review items
- are recovery commands obvious enough?
- does `zigrix doctor` give actionable output?
- can a new user find quickstart without reading source?
- do release assets match docs?

## Publish note
npm publish is intentionally manual for the next step. Tonight's goal is publish-ready packaging, not automatic registry release.
