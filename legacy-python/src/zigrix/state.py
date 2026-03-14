from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
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
    task["updatedAt"] = now_iso()
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



def list_task_events(paths: ZigrixPaths, task_id: str | None = None) -> list[dict[str, Any]]:
    rows = load_events(paths.events_file)
    if not task_id:
        return rows
    return [row for row in rows if str(row.get("taskId", "")) == task_id]



def create_task(
    paths: ZigrixPaths,
    *,
    title: str,
    description: str,
    scale: str = "normal",
    required_agents: list[str] | None = None,
) -> dict[str, Any]:
    task_id = next_task_id(paths)
    task = {
        "taskId": task_id,
        "title": title,
        "description": description,
        "scale": scale,
        "status": "OPEN",
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
        "requiredAgents": list(required_agents or []),
        "workerSessions": {},
    }
    save_task(paths, task)
    append_event(
        paths.events_file,
        {
            "event": "task_created",
            "taskId": task_id,
            "status": "OPEN",
            "title": title,
            "scale": scale,
            "payload": {
                "requiredAgents": list(required_agents or []),
            },
        },
    )
    rebuild_index(paths)
    return task



def update_task_status(paths: ZigrixPaths, task_id: str, status: str) -> dict[str, Any] | None:
    task = load_task(paths, task_id)
    if not task:
        return None
    task["status"] = status
    save_task(paths, task)
    append_event(paths.events_file, {"event": "task_status_changed", "taskId": task_id, "status": status})
    rebuild_index(paths)
    return task



def record_task_progress(
    paths: ZigrixPaths,
    *,
    task_id: str,
    actor: str,
    message: str,
    unit_id: str | None = None,
    work_package: str | None = None,
) -> dict[str, Any] | None:
    task = load_task(paths, task_id)
    if not task:
        return None
    save_task(paths, task)
    event = append_event(
        paths.events_file,
        {
            "event": "progress_report",
            "taskId": task_id,
            "phase": "execution",
            "actor": actor,
            "payload": {
                "message": message,
                "unitId": unit_id,
                "workPackage": work_package,
            },
        },
    )
    rebuild_index(paths)
    return event



def find_stale_tasks(paths: ZigrixPaths, *, hours: float = 24.0) -> list[dict[str, Any]]:
    cutoff = _now_dt() - timedelta(hours=hours)
    stale: list[dict[str, Any]] = []
    for task in list_tasks(paths):
        status = str(task.get("status", "UNKNOWN"))
        if status != "IN_PROGRESS":
            continue
        updated = _parse_dt(str(task.get("updatedAt", "")))
        if updated and updated < cutoff:
            stale.append(task)
    return stale



def apply_stale_policy(
    paths: ZigrixPaths,
    *,
    hours: float = 24.0,
    reason: str = "stale_timeout",
) -> dict[str, Any]:
    stale_tasks = find_stale_tasks(paths, hours=hours)
    changed: list[dict[str, Any]] = []
    for task in stale_tasks:
        task_id = str(task.get("taskId"))
        task["status"] = "BLOCKED"
        save_task(paths, task)
        event = append_event(
            paths.events_file,
            {
                "event": "task_blocked",
                "taskId": task_id,
                "phase": "recovery",
                "actor": "zigrix",
                "status": "BLOCKED",
                "payload": {
                    "reason": reason,
                    "previousStatus": "IN_PROGRESS",
                    "hoursThreshold": hours,
                },
            },
        )
        changed.append({"taskId": task_id, "event": event})
    rebuild_index(paths)
    return {
        "ok": True,
        "hours": hours,
        "reason": reason,
        "count": len(changed),
        "changed": changed,
    }



def rebuild_index(paths: ZigrixPaths) -> dict[str, Any]:
    ensure_project_state(paths)
    tasks = list_tasks(paths)
    events = load_events(paths.events_file)
    active_statuses = {"OPEN", "IN_PROGRESS", "BLOCKED", "DONE_PENDING_REPORT"}
    index = {
        "version": "0.1",
        "updatedAt": now_iso(),
        "counts": {
            "tasks": len(tasks),
            "events": len(events),
        },
        "statusBuckets": {},
        "activeTasks": {},
        "taskSummaries": {},
    }
    buckets: dict[str, list[str]] = {}
    task_summaries: dict[str, dict[str, Any]] = {}
    for task in tasks:
        task_id = str(task.get("taskId"))
        status = str(task.get("status", "UNKNOWN"))
        buckets.setdefault(status, []).append(task_id)
        summary = {
            "title": task.get("title"),
            "status": status,
            "scale": task.get("scale"),
            "requiredAgents": task.get("requiredAgents", []),
            "updatedAt": task.get("updatedAt"),
        }
        task_summaries[task_id] = summary
        if status in active_statuses:
            index["activeTasks"][task_id] = summary
    index["statusBuckets"] = dict(sorted(buckets.items()))
    index["taskSummaries"] = task_summaries
    paths.index_file.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return index



def _parse_dt(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None



def _now_dt() -> datetime:
    return datetime.fromisoformat(now_iso())
