from __future__ import annotations

from pathlib import Path
from typing import Any

from zigrix.events import append_event
from zigrix.paths import ZigrixPaths, ensure_project_state
from zigrix.state import load_task, save_task


DEFAULT_REQUIRED_AGENTS = ["pro-zig", "qa-zig"]



def resolve_required_agents(task: dict[str, Any]) -> list[str]:
    for key in ("requiredAgents", "selectedAgents", "baselineRequiredAgents"):
        value = task.get(key)
        if isinstance(value, list) and value:
            return [str(item) for item in value]
    workers = task.get("workerSessions")
    if isinstance(workers, dict) and workers:
        return sorted(str(key) for key in workers.keys())
    return list(DEFAULT_REQUIRED_AGENTS)



def prepare_worker(
    paths: ZigrixPaths,
    *,
    task_id: str,
    agent_id: str,
    description: str,
    constraints: str = "",
    unit_id: str | None = None,
    work_package: str | None = None,
    dod: str = "",
) -> dict[str, Any] | None:
    ensure_project_state(paths)
    task = load_task(paths, task_id)
    if not task:
        return None

    prompt = _render_prompt(
        task=task,
        agent_id=agent_id,
        description=description,
        constraints=constraints,
        unit_id=unit_id,
        work_package=work_package,
        dod=dod,
    )
    prompt_path = paths.prompts_dir / f"{task_id}-{agent_id}.md"
    prompt_path.write_text(prompt + "\n", encoding="utf-8")

    workers = task.setdefault("workerSessions", {})
    worker_entry = workers.setdefault(agent_id, {})
    worker_entry.update(
        {
            "status": "prepared",
            "unitId": unit_id,
            "workPackage": work_package,
            "promptPath": str(prompt_path),
        }
    )
    required = task.setdefault("requiredAgents", resolve_required_agents(task))
    if agent_id not in required:
        required.append(agent_id)
    task["workerSessions"] = workers
    save_task(paths, task)

    append_event(
        paths.events_file,
        {
            "event": "worker_prepared",
            "taskId": task_id,
            "phase": "execution",
            "actor": "zigrix",
            "targetAgent": agent_id,
            "status": "IN_PROGRESS",
            "unitId": unit_id,
            "workPackage": work_package,
            "payload": {
                "agentId": agent_id,
                "description": description,
                "constraints": constraints,
                "dod": dod,
                "promptPath": str(prompt_path),
            },
        },
    )
    return {
        "ok": True,
        "taskId": task_id,
        "agentId": agent_id,
        "promptPath": str(prompt_path),
        "prompt": prompt,
        "unitId": unit_id,
        "workPackage": work_package,
    }



def _parse_session_id_from_key(session_key: str) -> str | None:
    """Extract sessionId from a sessionKey of the form ``agent:<agentId>:subagent:<sessionId>``."""
    import re
    m = re.match(r"^agent:[^:]+:subagent:([^:\s]+)$", session_key)
    return m.group(1) if m else None


def register_worker(
    paths: ZigrixPaths,
    *,
    task_id: str,
    agent_id: str,
    session_key: str,
    run_id: str = "",
    session_id: str = "",
    unit_id: str | None = None,
    work_package: str | None = None,
    reason: str = "",
) -> dict[str, Any] | None:
    task = load_task(paths, task_id)
    if not task:
        return None

    # Resolve sessionId: use provided value, or fall back to parsing it from sessionKey
    resolved_session_id = session_id or _parse_session_id_from_key(session_key) or ""

    workers = task.setdefault("workerSessions", {})
    entry = workers.setdefault(agent_id, {})
    entry.update(
        {
            "status": "dispatched",
            "sessionKey": session_key,
            "runId": run_id,
            "sessionId": resolved_session_id or None,
            "unitId": unit_id,
            "workPackage": work_package,
            "reason": reason,
        }
    )
    required = task.setdefault("requiredAgents", resolve_required_agents(task))
    if agent_id not in required:
        required.append(agent_id)
    task["workerSessions"] = workers
    save_task(paths, task)

    append_event(
        paths.events_file,
        {
            "event": "worker_dispatched",
            "taskId": task_id,
            "phase": "execution",
            "actor": "zigrix",
            "targetAgent": agent_id,
            "status": "IN_PROGRESS",
            "sessionKey": session_key,
            "sessionId": resolved_session_id or None,
            "unitId": unit_id,
            "workPackage": work_package,
            "payload": {
                "agentId": agent_id,
                "runId": run_id,
                "reason": reason,
            },
        },
    )
    return {
        "ok": True,
        "taskId": task_id,
        "agentId": agent_id,
        "sessionKey": session_key,
        "runId": run_id,
        "sessionId": resolved_session_id or None,
        "unitId": unit_id,
        "workPackage": work_package,
        "status": "dispatched",
    }



def complete_worker(
    paths: ZigrixPaths,
    *,
    task_id: str,
    agent_id: str,
    session_key: str,
    run_id: str,
    result: str = "done",
    session_id: str = "",
    unit_id: str | None = None,
    work_package: str | None = None,
) -> dict[str, Any] | None:
    task = load_task(paths, task_id)
    if not task:
        return None

    workers = task.setdefault("workerSessions", {})
    entry = workers.setdefault(agent_id, {})
    entry.update(
        {
            "status": result,
            "sessionKey": session_key,
            "runId": run_id,
            "sessionId": session_id or entry.get("sessionId"),
            "unitId": unit_id or entry.get("unitId"),
            "workPackage": work_package or entry.get("workPackage"),
        }
    )
    task["workerSessions"] = workers
    save_task(paths, task)

    append_event(
        paths.events_file,
        {
            "event": "worker_done",
            "taskId": task_id,
            "phase": "execution",
            "actor": agent_id,
            "targetAgent": agent_id,
            "status": "BLOCKED" if result == "blocked" else "IN_PROGRESS",
            "sessionKey": session_key,
            "sessionId": session_id or None,
            "unitId": unit_id or entry.get("unitId"),
            "workPackage": work_package or entry.get("workPackage"),
            "payload": {
                "result": result,
                "runId": run_id,
            },
        },
    )

    required = resolve_required_agents(task)
    evidence_dir = paths.evidence_dir / task_id
    present_agents = sorted(
        p.stem for p in evidence_dir.glob("*.json") if p.name != "_merged.json"
    ) if evidence_dir.exists() else []
    missing_agents = [agent for agent in required if agent not in present_agents]
    return {
        "ok": True,
        "taskId": task_id,
        "agentId": agent_id,
        "result": result,
        "requiredAgents": required,
        "presentEvidenceAgents": present_agents,
        "missingEvidenceAgents": missing_agents,
        "allEvidenceCollected": len(missing_agents) == 0,
    }



def _render_prompt(
    *,
    task: dict[str, Any],
    agent_id: str,
    description: str,
    constraints: str,
    unit_id: str | None,
    work_package: str | None,
    dod: str,
) -> str:
    title = str(task.get("title", task.get("taskId", "Untitled Task")))
    scale = str(task.get("scale", "unknown"))
    task_id = str(task.get("taskId", "TASK-UNKNOWN"))

    sections = [
        f"## Worker Assignment: {task_id}",
        "",
        "| Field | Value |",
        "|---|---|",
        f"| taskId | {task_id} |",
        f"| title | {title} |",
        f"| scale | {scale} |",
        f"| role | {agent_id} |",
        "",
        "### Assignment",
        description,
    ]
    if constraints:
        sections.extend(["", "### Constraints", constraints])
    if dod:
        sections.extend(["", "### Definition of Done", dod])
    if unit_id or work_package:
        sections.extend(
            [
                "",
                "### Execution Context",
                f"- unitId: {unit_id or 'N/A'}",
                f"- workPackage: {work_package or 'N/A'}",
            ]
        )
    sections.extend(
        [
            "",
            "### Completion",
            "작업 완료 후 결과와 근거를 명확히 보고하라.",
        ]
    )
    return "\n".join(sections)
