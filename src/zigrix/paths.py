from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ZigrixPaths:
    config_home: Path
    data_home: Path
    cache_home: Path
    project_root: Path
    project_state: Path
    tasks_dir: Path
    prompts_dir: Path
    evidence_dir: Path
    events_file: Path
    index_file: Path



def _xdg_path(env_name: str, default: str) -> Path:
    value = os.environ.get(env_name, "").strip()
    if value:
        return Path(value).expanduser()
    return Path(default).expanduser()



def resolve_paths(cwd: str | Path | None = None) -> ZigrixPaths:
    project_root = Path(cwd or Path.cwd()).expanduser().resolve()
    project_state = project_root / ".zigrix"
    config_home = _xdg_path("XDG_CONFIG_HOME", "~/.config") / "zigrix"
    data_home = _xdg_path("XDG_DATA_HOME", "~/.local/share") / "zigrix"
    cache_home = _xdg_path("XDG_CACHE_HOME", "~/.cache") / "zigrix"
    return ZigrixPaths(
        config_home=config_home,
        data_home=data_home,
        cache_home=cache_home,
        project_root=project_root,
        project_state=project_state,
        tasks_dir=project_state / "tasks",
        prompts_dir=project_state / "prompts",
        evidence_dir=project_state / "evidence",
        events_file=project_state / "tasks.jsonl",
        index_file=project_state / "index.json",
    )



def ensure_project_state(paths: ZigrixPaths) -> None:
    paths.project_state.mkdir(parents=True, exist_ok=True)
    paths.tasks_dir.mkdir(parents=True, exist_ok=True)
    paths.prompts_dir.mkdir(parents=True, exist_ok=True)
    paths.evidence_dir.mkdir(parents=True, exist_ok=True)



def find_openclaw_home() -> Path:
    explicit = os.environ.get("OPENCLAW_HOME", "").strip()
    if explicit:
        return Path(explicit).expanduser()
    return Path("~/.openclaw").expanduser()
