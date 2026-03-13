from __future__ import annotations

from typing import Any

from zigrix.evidence import collect_evidence, merge_evidence
from zigrix.paths import ZigrixPaths
from zigrix.report import render_report
from zigrix.state import create_task, update_task_status



def run_pipeline(
    paths: ZigrixPaths,
    *,
    title: str,
    description: str,
    scale: str = "normal",
    required_agents: list[str] | None = None,
    evidence_summaries: list[str] | None = None,
    require_qa: bool = False,
    auto_report: bool = False,
    record_feedback: bool = False,
) -> dict[str, Any]:
    steps: list[dict[str, Any]] = []
    task = create_task(
        paths,
        title=title,
        description=description,
        scale=scale,
        required_agents=required_agents,
    )
    task_id = str(task["taskId"])
    steps.append({"step": "task_create", "result": task})

    started = update_task_status(paths, task_id, "IN_PROGRESS")
    steps.append({"step": "task_start", "result": started})

    for raw in evidence_summaries or []:
        if "=" not in raw:
            raise ValueError(f"invalid evidence summary format: {raw} (expected agentId=summary)")
        agent_id, summary = raw.split("=", 1)
        result = collect_evidence(
            paths,
            task_id=task_id,
            agent_id=agent_id.strip(),
            summary=summary.strip(),
        )
        steps.append({"step": "evidence_collect", "agentId": agent_id.strip(), "result": result})

    merged = merge_evidence(paths, task_id=task_id, required_agents=required_agents, require_qa=require_qa)
    steps.append({"step": "evidence_merge", "result": merged})

    if merged and merged.get("complete"):
        finalized = update_task_status(paths, task_id, "DONE_PENDING_REPORT")
        steps.append({"step": "task_finalize", "result": finalized})
        if auto_report:
            report = render_report(paths, task_id=task_id, record_events=record_feedback)
            reported = update_task_status(paths, task_id, "REPORTED")
            steps.append({"step": "report_render", "result": report})
            steps.append({"step": "task_report", "result": reported})

    return {
        "ok": True,
        "taskId": task_id,
        "complete": bool(merged and merged.get("complete")),
        "missingAgents": list(merged.get("missingAgents", [])) if isinstance(merged, dict) else [],
        "steps": steps,
    }
