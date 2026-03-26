# Security Policy

## Supported versions

Zigrix is in a pre-1.0 semver phase. Security fixes target the latest supported `0.x` release line.

## Reporting a vulnerability

Please do **not** open a public issue for security-sensitive findings.

Instead, report privately to the maintainer with:
- affected version or commit
- reproduction steps
- impact assessment
- suggested mitigation if available

Until a dedicated security inbox is published, use a private channel with the maintainer rather than a public GitHub issue.

## Scope notes

High-priority reports include:
- installer compromise risks
- unsafe shell execution paths
- path traversal or file overwrite issues
- secrets leakage in logs/output
- unsafe OpenClaw integration behavior
- release asset integrity weaknesses

## Hardening goals

Zigrix aims to:
- avoid hidden network behavior by default
- keep telemetry off unless explicitly documented
- prefer explicit user-visible install/update paths
- keep destructive operations opt-in and obvious
