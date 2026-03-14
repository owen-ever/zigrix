from __future__ import annotations

import json
from typing import Any

from zigrix.events import append_event
from zigrix.paths import ZigrixPaths
from zigrix.state import load_task, rebuild_index



def render_report(paths: ZigrixPaths, *, task_id: str, record_events: bool = False) -> dict[str, Any] | None:
    task = load_task(paths, task_id)
    if not task:
        return None

    merged_path = paths.evidence_dir / task_id / "_merged.json"
    merged = _read_json(merged_path, {})
    if not isinstance(merged, dict):
        merged = {}

    title = str(task.get("title") or task_id)
    scale = str(task.get("scale") or "unknown")
    agents = _summarize_agents(merged)
    agent_lines = _collect_agent_lines(merged)
    risks = _collect_risks(merged)
    missing = [str(x) for x in merged.get("missingAgents", []) if x] if isinstance(merged, dict) else []
    complete = bool(merged.get("complete", False)) if isinstance(merged, dict) else False

    final_state = "완료(REPORTED)" if complete else "부분완료/추가확인필요"
    summary_lines = [
        f"- 태스크: `{task_id}` / {title}",
        f"- 상태: {final_state}",
    ]
    if agents:
        summary_lines.append(f"- 참여 에이전트: {', '.join(agents)}")

    risk_lines: list[str] = []
    if missing:
        risk_lines.append(f"- 누락 에이전트: {', '.join(missing)}")
    for risk in risks:
        risk_lines.append(f"- {risk}")
    if not risk_lines:
        risk_lines.append("- 특이 리스크 없음")

    text = "\n".join(
        [
            f"작업유형: {scale}",
            "",
            "진행 요약",
            *summary_lines,
            "",
            "에이전트별 수행 내역",
            *agent_lines,
            "",
            "QA 결과",
            _qa_line(merged),
            "",
            "남은 리스크 / 후속 액션",
            *risk_lines,
            "",
            "피드백 요청",
            "- 만족도(1~5), 좋았던 점, 개선할 점 있으면 짧게 주세요.",
        ]
    ).strip()

    if record_events:
        append_event(
            paths.events_file,
            {
                "event": "user_report_prepared",
                "taskId": task_id,
                "phase": "reporting",
                "actor": "zigrix",
                "payload": {
                    "preview": text[:300],
                },
            },
        )
        append_event(
            paths.events_file,
            {
                "event": "feedback_requested",
                "taskId": task_id,
                "phase": "reporting",
                "actor": "zigrix",
                "payload": {
                    "questions": [
                        "만족도(1~5)는?",
                        "좋았던 점은?",
                        "개선할 점은?",
                    ]
                },
            },
        )
        rebuild_index(paths)

    return {
        "ok": True,
        "taskId": task_id,
        "complete": complete,
        "missingAgents": missing,
        "report": text,
    }



def _read_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default



def _summarize_agents(merged: dict[str, Any]) -> list[str]:
    agents: list[str] = []
    for item in merged.get("items", []) if isinstance(merged, dict) else []:
        if isinstance(item, dict) and item.get("agentId"):
            agents.append(str(item["agentId"]))
    if not agents and isinstance(merged, dict):
        agents = [str(agent) for agent in merged.get("presentAgents", []) if agent]
    return agents



def _collect_risks(merged: dict[str, Any]) -> list[str]:
    risks: list[str] = []
    for item in merged.get("items", []) if isinstance(merged, dict) else []:
        if not isinstance(item, dict):
            continue
        evidence = item.get("evidence", {}) if isinstance(item.get("evidence"), dict) else {}
        for risk in evidence.get("risks", []) if isinstance(evidence.get("risks"), list) else []:
            text = str(risk)
            if text and text not in risks:
                risks.append(text)
    return risks



def _collect_agent_lines(merged: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    for item in merged.get("items", []) if isinstance(merged, dict) else []:
        if not isinstance(item, dict):
            continue
        agent_id = str(item.get("agentId") or "unknown")
        evidence = item.get("evidence", {}) if isinstance(item.get("evidence"), dict) else {}
        summary = evidence.get("summary") or evidence.get("lastAssistant") or evidence.get("verdict") or "수행 기록 있음"
        lines.append(f"- {agent_id}: {summary}")
    return lines or ["- 참여 에이전트 기록 없음"]



def _qa_line(merged: dict[str, Any]) -> str:
    present = set(str(agent) for agent in merged.get("presentAgents", []) if agent) if isinstance(merged, dict) else set()
    if "qa-zig" in present:
        return "- qa-zig evidence 존재, QA 수행됨"
    return "- qa-zig evidence 없음 또는 별도 QA 미실행"
