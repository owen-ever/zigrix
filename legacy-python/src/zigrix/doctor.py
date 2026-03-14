from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path
from typing import Any

from zigrix.paths import ZigrixPaths, find_openclaw_home



def gather_doctor(paths: ZigrixPaths) -> dict[str, Any]:
    openclaw_home = find_openclaw_home()
    checks = {
        "python": {
            "executable": sys.executable,
            "version": sys.version.split()[0],
            "ok": sys.version_info >= (3, 10),
        },
        "paths": {
            "projectRoot": str(paths.project_root),
            "projectState": str(paths.project_state),
            "configHome": str(paths.config_home),
            "dataHome": str(paths.data_home),
            "cacheHome": str(paths.cache_home),
        },
        "writeAccess": {
            "projectRoot": os.access(paths.project_root, os.W_OK),
            "projectStateParent": os.access(paths.project_root, os.W_OK),
        },
        "binaries": {
            "python3": shutil.which("python3"),
            "uv": shutil.which("uv"),
            "pipx": shutil.which("pipx"),
            "openclaw": shutil.which("openclaw"),
        },
        "openclaw": {
            "home": str(openclaw_home),
            "exists": openclaw_home.exists(),
            "skillsDir": str(openclaw_home / "skills"),
            "skillsDirExists": (openclaw_home / "skills").exists(),
        },
    }
    checks["summary"] = {
        "ready": bool(checks["python"]["ok"] and checks["writeAccess"]["projectRoot"]),
        "warnings": _warnings(checks),
    }
    return checks



def _warnings(payload: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    if not payload["python"]["ok"]:
        warnings.append("Python 3.10+ is required.")
    if not payload["binaries"]["openclaw"]:
        warnings.append("OpenClaw binary not found on PATH. Core CLI can still work.")
    if not payload["openclaw"]["exists"]:
        warnings.append("~/.openclaw not found. OpenClaw skill install will be skipped unless configured.")
    return warnings



def render_doctor_text(payload: dict[str, Any]) -> str:
    lines = [
        "Zigrix Doctor",
        f"- Python: {payload['python']['version']} ({'ok' if payload['python']['ok'] else 'too old'})",
        f"- Project root: {payload['paths']['projectRoot']}",
        f"- Project state: {payload['paths']['projectState']}",
        f"- OpenClaw home: {payload['openclaw']['home']} ({'present' if payload['openclaw']['exists'] else 'missing'})",
        f"- openclaw binary: {payload['binaries']['openclaw'] or 'not found'}",
        f"- uv binary: {payload['binaries']['uv'] or 'not found'}",
        f"- pipx binary: {payload['binaries']['pipx'] or 'not found'}",
        f"- Ready: {'yes' if payload['summary']['ready'] else 'no'}",
    ]
    for warning in payload['summary']['warnings']:
        lines.append(f"- Warning: {warning}")
    return "\n".join(lines)
