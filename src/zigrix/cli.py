from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from zigrix import __version__
from zigrix.doctor import gather_doctor, render_doctor_text
from zigrix.evidence import collect_evidence, merge_evidence
from zigrix.paths import ensure_project_state, resolve_paths
from zigrix.state import create_task, list_task_events, list_tasks, load_task, rebuild_index, update_task_status
from zigrix.worker import complete_worker, prepare_worker, register_worker


STATUS_MAP = {
    "start": "IN_PROGRESS",
    "finalize": "DONE_PENDING_REPORT",
    "report": "REPORTED",
}



def _print(payload: Any, as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        if isinstance(payload, str):
            print(payload)
        else:
            print(json.dumps(payload, ensure_ascii=False, indent=2))



def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="zigrix", description="OpenClaw agent-oriented development orchestration CLI")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    parser.add_argument("--project-root", default=".", help="Project root to operate on (default: current directory)")
    parser.add_argument("--version", action="store_true", help="Print Zigrix version")

    sub = parser.add_subparsers(dest="command")

    sub.add_parser("init", help="Create .zigrix runtime directories in the current project")
    sub.add_parser("doctor", help="Inspect environment, paths, and OpenClaw integration readiness")
    sub.add_parser("version", help="Print Zigrix version")

    task = sub.add_parser("task", help="Task operations")
    task_sub = task.add_subparsers(dest="task_command")

    create = task_sub.add_parser("create", help="Create a task")
    create.add_argument("--title", required=True)
    create.add_argument("--description", required=True)
    create.add_argument("--scale", default="normal", choices=["simple", "normal", "risky", "large"])
    create.add_argument("--required-agent", action="append", default=[], dest="required_agents")

    task_sub.add_parser("list", help="List tasks")

    status = task_sub.add_parser("status", help="Show one task")
    status.add_argument("task_id")

    events = task_sub.add_parser("events", help="Show task events")
    events.add_argument("task_id", nargs="?")

    for name in ("start", "finalize", "report"):
        cmd = task_sub.add_parser(name, help=f"Mark task as {STATUS_MAP[name]}")
        cmd.add_argument("task_id")

    worker = sub.add_parser("worker", help="Worker lifecycle operations")
    worker_sub = worker.add_subparsers(dest="worker_command")

    prepare = worker_sub.add_parser("prepare", help="Generate and store a worker prompt")
    prepare.add_argument("--task-id", required=True)
    prepare.add_argument("--agent-id", required=True)
    prepare.add_argument("--description", required=True)
    prepare.add_argument("--constraints", default="")
    prepare.add_argument("--unit-id", default=None)
    prepare.add_argument("--work-package", default=None)
    prepare.add_argument("--dod", default="")

    register = worker_sub.add_parser("register", help="Register a dispatched worker session")
    register.add_argument("--task-id", required=True)
    register.add_argument("--agent-id", required=True)
    register.add_argument("--session-key", required=True)
    register.add_argument("--run-id", default="")
    register.add_argument("--session-id", default="")
    register.add_argument("--unit-id", default=None)
    register.add_argument("--work-package", default=None)
    register.add_argument("--reason", default="")

    complete = worker_sub.add_parser("complete", help="Mark a worker run complete/blocked/skipped")
    complete.add_argument("--task-id", required=True)
    complete.add_argument("--agent-id", required=True)
    complete.add_argument("--session-key", required=True)
    complete.add_argument("--run-id", required=True)
    complete.add_argument("--session-id", default="")
    complete.add_argument("--result", default="done", choices=["done", "blocked", "skipped"])
    complete.add_argument("--unit-id", default=None)
    complete.add_argument("--work-package", default=None)

    evidence = sub.add_parser("evidence", help="Evidence collection and merge operations")
    evidence_sub = evidence.add_subparsers(dest="evidence_command")

    collect = evidence_sub.add_parser("collect", help="Collect evidence for one agent")
    collect.add_argument("--task-id", required=True)
    collect.add_argument("--agent-id", required=True)
    collect.add_argument("--run-id", default="")
    collect.add_argument("--unit-id", default=None)
    collect.add_argument("--session-key", default="")
    collect.add_argument("--session-id", default="")
    collect.add_argument("--transcript", default="")
    collect.add_argument("--summary", default="")
    collect.add_argument("--tool-result", action="append", default=[], dest="tool_results")
    collect.add_argument("--notes", default="")
    collect.add_argument("--limit", type=int, default=40)

    merge = evidence_sub.add_parser("merge", help="Merge evidence for one task")
    merge.add_argument("--task-id", required=True)
    merge.add_argument("--required-agent", action="append", default=[], dest="required_agents")
    merge.add_argument("--require-qa", action="store_true")

    sub.add_parser("index-rebuild", help="Rebuild .zigrix/index.json from task files")
    return parser



def _extract_global_flags(argv: list[str]) -> tuple[list[str], bool, str]:
    remaining: list[str] = []
    as_json = False
    project_root = "."
    i = 0
    while i < len(argv):
        token = argv[i]
        if token == "--json":
            as_json = True
            i += 1
            continue
        if token == "--project-root":
            if i + 1 >= len(argv):
                raise SystemExit("--project-root requires a value")
            project_root = argv[i + 1]
            i += 2
            continue
        remaining.append(token)
        i += 1
    return remaining, as_json, project_root



def main(argv: list[str] | None = None) -> int:
    raw_argv = list(argv if argv is not None else sys.argv[1:])
    normalized_argv, extracted_json, extracted_project_root = _extract_global_flags(raw_argv)
    parser = build_parser()
    args = parser.parse_args(normalized_argv)
    args.json = bool(getattr(args, "json", False) or extracted_json)
    args.project_root = getattr(args, "project_root", extracted_project_root) or extracted_project_root

    if (args.version and not args.command) or args.command == "version":
        _print({"version": __version__} if args.json else f"zigrix {__version__}", args.json)
        return 0

    paths = resolve_paths(Path(args.project_root))

    if args.command == "init":
        ensure_project_state(paths)
        rebuild_index(paths)
        payload = {
            "ok": True,
            "projectRoot": str(paths.project_root),
            "projectState": str(paths.project_state),
        }
        _print(payload if args.json else f"Initialized Zigrix state at {paths.project_state}", args.json)
        return 0

    if args.command == "doctor":
        payload = gather_doctor(paths)
        _print(payload if args.json else render_doctor_text(payload), args.json)
        return 0 if payload["summary"]["ready"] else 1

    if args.command == "index-rebuild":
        payload = rebuild_index(paths)
        _print(payload, args.json)
        return 0

    if args.command == "task":
        if args.task_command == "create":
            task = create_task(
                paths,
                title=args.title,
                description=args.description,
                scale=args.scale,
                required_agents=args.required_agents,
            )
            _print(task if args.json else f"Created task {task['taskId']}: {task['title']}", args.json)
            return 0
        if args.task_command == "list":
            tasks = list_tasks(paths)
            if args.json:
                _print(tasks, True)
            else:
                if not tasks:
                    print("No tasks found.")
                for task in tasks:
                    required = ",".join(task.get("requiredAgents", []))
                    suffix = f"  (agents: {required})" if required else ""
                    print(f"{task['taskId']}  [{task['status']}]  {task['title']}{suffix}")
            return 0
        if args.task_command == "status":
            task = load_task(paths, args.task_id)
            if not task:
                _print({"error": "task_not_found", "taskId": args.task_id}, args.json)
                return 4
            _print(task, args.json)
            return 0
        if args.task_command == "events":
            payload = list_task_events(paths, args.task_id)
            _print(payload, True if args.json else False)
            return 0
        if args.task_command in STATUS_MAP:
            task = update_task_status(paths, args.task_id, STATUS_MAP[args.task_command])
            if not task:
                _print({"error": "task_not_found", "taskId": args.task_id}, args.json)
                return 4
            _print(task if args.json else f"{task['taskId']} -> {task['status']}", args.json)
            return 0

    if args.command == "worker":
        if args.worker_command == "prepare":
            payload = prepare_worker(
                paths,
                task_id=args.task_id,
                agent_id=args.agent_id,
                description=args.description,
                constraints=args.constraints,
                unit_id=args.unit_id,
                work_package=args.work_package,
                dod=args.dod,
            )
            if not payload:
                _print({"error": "task_not_found", "taskId": args.task_id}, args.json)
                return 4
            _print(payload if args.json else payload["prompt"], args.json)
            return 0
        if args.worker_command == "register":
            payload = register_worker(
                paths,
                task_id=args.task_id,
                agent_id=args.agent_id,
                session_key=args.session_key,
                run_id=args.run_id,
                session_id=args.session_id,
                unit_id=args.unit_id,
                work_package=args.work_package,
                reason=args.reason,
            )
            if not payload:
                _print({"error": "task_not_found", "taskId": args.task_id}, args.json)
                return 4
            _print(payload, True if args.json else False)
            return 0
        if args.worker_command == "complete":
            payload = complete_worker(
                paths,
                task_id=args.task_id,
                agent_id=args.agent_id,
                session_key=args.session_key,
                run_id=args.run_id,
                result=args.result,
                session_id=args.session_id,
                unit_id=args.unit_id,
                work_package=args.work_package,
            )
            if not payload:
                _print({"error": "task_not_found", "taskId": args.task_id}, args.json)
                return 4
            _print(payload, True if args.json else False)
            return 0

    if args.command == "evidence":
        if args.evidence_command == "collect":
            payload = collect_evidence(
                paths,
                task_id=args.task_id,
                agent_id=args.agent_id,
                run_id=args.run_id,
                unit_id=args.unit_id,
                session_key=args.session_key,
                session_id=args.session_id,
                transcript=args.transcript,
                summary=args.summary,
                tool_results=args.tool_results,
                notes=args.notes,
                limit=args.limit,
            )
            if not payload:
                _print({"error": "task_not_found", "taskId": args.task_id}, args.json)
                return 4
            _print(payload, True if args.json else False)
            return 0
        if args.evidence_command == "merge":
            payload = merge_evidence(
                paths,
                task_id=args.task_id,
                required_agents=args.required_agents,
                require_qa=args.require_qa,
            )
            if not payload:
                _print({"error": "task_not_found", "taskId": args.task_id}, args.json)
                return 4
            _print(payload, True if args.json else False)
            return 0

    parser.print_help()
    return 0
