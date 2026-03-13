from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from zigrix import __version__
from zigrix.doctor import gather_doctor, render_doctor_text
from zigrix.paths import ensure_project_state, resolve_paths
from zigrix.state import create_task, list_tasks, load_task, rebuild_index, update_task_status


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

    task_sub.add_parser("list", help="List tasks")

    status = task_sub.add_parser("status", help="Show one task")
    status.add_argument("task_id")

    for name in ("start", "finalize", "report"):
        cmd = task_sub.add_parser(name, help=f"Mark task as {STATUS_MAP[name]}")
        cmd.add_argument("task_id")

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
        _print(payload, True if args.json else False)
        return 0

    if args.command == "task":
        if args.task_command == "create":
            task = create_task(paths, title=args.title, description=args.description, scale=args.scale)
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
                    print(f"{task['taskId']}  [{task['status']}]  {task['title']}")
            return 0
        if args.task_command == "status":
            task = load_task(paths, args.task_id)
            if not task:
                _print({"error": "task_not_found", "taskId": args.task_id}, True if args.json else False)
                return 4
            _print(task, True if args.json else False)
            return 0
        if args.task_command in STATUS_MAP:
            task = update_task_status(paths, args.task_id, STATUS_MAP[args.task_command])
            if not task:
                _print({"error": "task_not_found", "taskId": args.task_id}, True if args.json else False)
                return 4
            _print(task if args.json else f"{task['taskId']} -> {task['status']}", args.json)
            return 0

    parser.print_help()
    return 0
