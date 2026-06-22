from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4


def _runtime_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


class RuntimeLogRepository:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = _runtime_dir() / "data"
        self._scenario_path = self._data_dir / "scenario_logs.jsonl"
        self._audit_path = self._data_dir / "audit_logs.jsonl"

    def append_scenario_event(self, event: dict) -> dict:
        record = self._with_defaults(event)
        self._append_jsonl(self._scenario_path, record)
        return record

    def append_audit_event(self, event: dict) -> dict:
        record = self._with_defaults(event)
        self._append_jsonl(self._audit_path, record)
        return record

    def list_scenario_events(self, limit: int = 100, scenario_id: str | None = None) -> list[dict]:
        if not self._scenario_path.exists():
            return []

        safe_limit = max(1, min(limit, 500))
        records: list[dict] = []

        with self._lock:
            with self._scenario_path.open("r", encoding="utf-8") as file:
                for line in file:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if scenario_id and record.get("scenarioId") != scenario_id:
                        continue
                    records.append(record)

        return records[-safe_limit:][::-1]

    def _with_defaults(self, event: dict) -> dict:
        return {
            "id": event.get("id") or f"log-{uuid4().hex[:12]}",
            "timestamp": event.get("timestamp") or datetime.now(timezone.utc).astimezone().isoformat(),
            **event,
        }

    def _append_jsonl(self, path: Path, record: dict) -> None:
        line = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        with self._lock:
            self._data_dir.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8", newline="\n") as file:
                file.write(line + "\n")


runtime_log_repository = RuntimeLogRepository()
