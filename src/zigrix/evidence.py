from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from zigrix.events import append_event, now_iso
from zigrix.paths import ZigrixPaths, ensure_project_state
from zigrix.state import load_task, rebuild_index
from zigrix.worker import resolve_required_agents



def collect_evidence(
    paths: ZigrixPaths,
    *,
    task_id: str,
    agent_id: str,
    run_id: str = "",
    unit_id: str | None = None,
    session_key: str = "",
    session_id: str = "",
    transcript: str = "",
    summary: str = "",
    tool_results: list[str] | None = None,
    notes: str = "",
    limit: int = 40,
) -> dict[str, Any] | None:
    ensure_project_state(paths)
    task = load_task(paths, task_id)
    if not task:
        return None

    transcript_rows: list[dict[str, Any]] = []
    transcript_path = ""
    extracted: dict[str, Any] = {}
    if transcript:
        transcript_path = str(Path(transcript).expanduser().resolve())
        transcript_rows = _read_transcript(Path(transcript_path), limit=limit)
        extracted = _extract_evidence(transcript_rows)
    if summary:
        extracted["summary"] = summary
        extracted.setdefault("lastAssistant", summary)
    if tool_results:
        extracted["toolResults"] = list(tool_results)
    if notes:
        extracted["notes"] = notes

    out_dir = paths.evidence_dir / task_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{agent_id}.json"
    payload = {
        "ts": now_iso(),
        "taskId": task_id,
        "agentId": agent_id,
        "unitId": unit_id,
        "runId": run_id,
        "sessionKey": session_key or None,
        "sessionId": session_id or None,
        "transcriptPath": transcript_path or None,
        "evidence": extracted,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    append_event(
        paths.events_file,
        {
            "event": "evidence_collected",
            "taskId": task_id,
            "phase": "verification",
            "actor": agent_id,
            "status": "IN_PROGRESS",
            "unitId": unit_id,
            "sessionKey": session_key or None,
            "payload": {
                "agentId": agent_id,
                "runId": run_id,
                "evidencePath": str(out_path),
            },
        },
    )
    rebuild_index(paths)
    return {
        "ok": True,
        "taskId": task_id,
        "agentId": agent_id,
        "evidencePath": str(out_path),
        "sessionId": session_id or None,
        "unitId": unit_id,
    }



def merge_evidence(
    paths: ZigrixPaths,
    *,
    task_id: str,
    required_agents: list[str] | None = None,
    require_qa: bool = False,
) -> dict[str, Any] | None:
    task = load_task(paths, task_id)
    if not task:
        return None

    task_dir = paths.evidence_dir / task_id
    task_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(f for f in task_dir.glob("*.json") if f.name != "_merged.json")

    merged_items: list[dict[str, Any]] = []
    present: list[str] = []
    for file in files:
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        agent_id = str(data.get("agentId") or file.stem)
        present.append(agent_id)
        merged_items.append(
            {
                "agentId": agent_id,
                "unitId": data.get("unitId"),
                "runId": data.get("runId"),
                "sessionKey": data.get("sessionKey"),
                "sessionId": data.get("sessionId"),
                "transcriptPath": data.get("transcriptPath"),
                "evidence": data.get("evidence", {}),
            }
        )

    required = list(required_agents or resolve_required_agents(task))
    missing = [agent for agent in required if agent not in present]
    qa_present = "qa-zig" in present
    complete = len(missing) == 0 and (not require_qa or qa_present)

    merged = {
        "ts": now_iso(),
        "taskId": task_id,
        "requiredAgents": required,
        "presentAgents": sorted(set(present)),
        "missingAgents": missing,
        "qaPresent": qa_present,
        "complete": complete,
        "items": merged_items,
    }
    out_path = task_dir / "_merged.json"
    out_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    append_event(
        paths.events_file,
        {
            "event": "evidence_merged",
            "taskId": task_id,
            "phase": "verification",
            "actor": "zigrix",
            "status": "DONE_PENDING_REPORT" if complete else "IN_PROGRESS",
            "payload": {
                "requiredAgents": required,
                "missingAgents": missing,
                "complete": complete,
                "mergedPath": str(out_path),
                "qaPresent": qa_present,
            },
        },
    )
    rebuild_index(paths)
    return {
        "ok": True,
        "taskId": task_id,
        "complete": complete,
        "missingAgents": missing,
        "mergedPath": str(out_path),
    }



def _read_transcript(path: Path, *, limit: int = 40) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines()[-limit:]:
        if not line.strip():
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            rows.append(parsed)
    return rows



def _extract_evidence(rows: list[dict[str, Any]]) -> dict[str, Any]:
    last_assistant = None
    tool_results: list[Any] = []
    for row in rows:
        role = row.get("role")
        content = row.get("content")
        if role == "assistant" and content:
            last_assistant = content
        if role == "toolResult":
            tool_results.append(content)
    return {
        "lastAssistant": last_assistant,
        "toolResults": tool_results[-3:],
    }
