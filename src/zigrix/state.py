from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from zigrix.events import append_event, load_events, now_iso
from zigrix.paths import ZigrixPaths, ensure_project_state


TASK_ID_RE = re.compile(r"^TASK-(\d{8})-(\d{3})$")



def next_task_id(paths: ZigrixPaths) -> str:
    ensure_project_state(paths)
    today = now_iso()[:10].replace("-", "")
    prefix = f"TASK-{today}-"
    max_n = 0
    for file in paths.tasks_dir.glob(f"{prefix}*.json"):
        match = TASK_ID_RE.match(file.stem)
        if match:
            max_n = max(max_n, int(match.group(2)))
    return f"{prefix}{max_n + 1:03d}"



def task_path(paths: ZigrixPaths, task_id: str) -> Path:
    return paths.tasks_dir / f"{task_id}.json"



def save_task(paths: ZigrixPaths, task: dict[str, Any]) -> Path:
    ensure_project_state(paths)
    path = task_path(paths, str(task["taskId"]))
    path.write_text(json.dumps(task, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rebuild_index(paths)
    return path



def load_task(paths: ZigrixPaths, task_id: str) -> dict[str, Any] | None:
    path = task_path(paths, task_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return data if isinstance(data, dict) else None



def list_tasks(paths: ZigrixPaths) -> list[dict[str, Any]]:
    ensure_project_state(paths)
    rows: list[dict[str, Any]] = []
    for file in sorted(paths.tasks_dir.glob("TASK-*.json")):
        try:
            payload = json.loads(file.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(payload, dict):
            rows.append(payload)
    return rows



def create_task(paths: ZigrixPaths, *, title: str, description: str, scale: str = "normal") -> dict[str, Any]:
    task_id = next_task_id(paths)
    task = {
        "taskId": task_id,
        "title": title,
        "description": description,
        "scale": scale,
        "status": "OPEN",
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    save_task(paths, task)
    append_event(paths.events_file, {"event": "task_created", "taskId": task_id, "status": "OPEN", "title": title, "scale": scale})
    rebuild_index(paths)
    return task



def update_task_status(paths: ZigrixPaths, task_id: str, status: str) -> dict[str, Any] | None:
    task = load_task(paths, task_id)
    if not task:
        return None
    task["status"] = status
    task["updatedAt"] = now_iso()
    save_task(paths, task)
    append_event(paths.events_file, {"event": "task_status_changed", "taskId": task_id, "status": status})
    rebuild_index(paths)
    return task



def rebuild_index(paths: ZigrixPaths) -> dict[str, Any]:
    ensure_project_state(paths)
    tasks = list_tasks(paths)
    events = load_events(paths.events_file)
    index = {
        "version": "0.1",
        "updatedAt": now_iso(),
        "counts": {
            "tasks": len(tasks),
            "events": len(events),
        },
        "statusBuckets": {},
    }
    buckets: dict[str, list[str]] = {}
    for task in tasks:
        status = str(task.get("status", "UNKNOWN"))
        buckets.setdefault(status, []).append(str(task.get("taskId")))
    index["statusBuckets"] = dict(sorted(buckets.items()))
    paths.index_file.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return index
