from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any



def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")



def append_event(events_file: Path, event: dict[str, Any]) -> dict[str, Any]:
    payload = dict(event)
    payload.setdefault("ts", now_iso())
    events_file.parent.mkdir(parents=True, exist_ok=True)
    with events_file.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
    return payload



def load_events(events_file: Path) -> list[dict[str, Any]]:
    if not events_file.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in events_file.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not line.strip():
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            rows.append(parsed)
    return rows
