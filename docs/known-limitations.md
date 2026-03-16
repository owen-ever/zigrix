# Known Limitations

- agent selection UX requires `@inquirer/prompts` for space-to-toggle; falls back to select-all in non-TTY environments
- PATH symlink targets `~/.local/bin/` which may not be in PATH on all systems — user must add manually if not
- config layering/source tracing is still minimal
- live agent dispatch/runtime integration is not part of the current local v1 core
- npm publish is prepared but intentionally deferred to a manual next step
- Windows-first support is not a release target yet
- `legacy-python/` remains useful as a reference during migration, but it is not a supported product path
- dedicated dashboard (D-018) is planned but not yet implemented
