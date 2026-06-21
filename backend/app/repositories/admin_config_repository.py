from __future__ import annotations

import json
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4

from fastapi import HTTPException

from ..data.default_admin_config import get_default_admin_config


def _runtime_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


class AdminConfigRepository:
    def __init__(self) -> None:
        self._lock = Lock()
        self._config: dict | None = None
        self._data_dir = _runtime_dir() / "data"
        self._config_path = self._data_dir / "admin_config.json"

    def list_agents(self) -> list[dict]:
        return deepcopy(self._load()["agents"])

    def update_agent(self, agent_id: str, patch: dict) -> dict:
        with self._lock:
            config = self._load_locked()
            for index, item in enumerate(config["agents"]):
                if item["id"] != agent_id:
                    continue
                config["agents"][index] = {**item, **patch, "id": agent_id}
                self._touch_locked(config)
                self._write_locked(config)
                return deepcopy(config["agents"][index])
        raise HTTPException(status_code=404, detail="Agent not found")

    def list_plan_actions(self) -> list[dict]:
        return deepcopy(self._load()["planActions"])

    def create_plan_action(self, payload: dict) -> dict:
        item = {
            **payload,
            "id": f"plan-action-{uuid4().hex[:8]}",
            "system": False,
        }
        with self._lock:
            config = self._load_locked()
            config["planActions"].insert(0, item)
            self._touch_locked(config)
            self._write_locked(config)
        return deepcopy(item)

    def update_plan_action(self, action_id: str, patch: dict) -> dict:
        with self._lock:
            config = self._load_locked()
            for index, item in enumerate(config["planActions"]):
                if item["id"] != action_id:
                    continue
                config["planActions"][index] = {**item, **patch, "id": action_id}
                self._touch_locked(config)
                self._write_locked(config)
                return deepcopy(config["planActions"][index])
        raise HTTPException(status_code=404, detail="Plan action not found")

    def delete_plan_action(self, action_id: str) -> None:
        with self._lock:
            config = self._load_locked()
            for index, item in enumerate(config["planActions"]):
                if item["id"] != action_id:
                    continue
                if item.get("system"):
                    raise HTTPException(status_code=403, detail="System plan action cannot be deleted")
                del config["planActions"][index]
                self._touch_locked(config)
                self._write_locked(config)
                return
        raise HTTPException(status_code=404, detail="Plan action not found")

    def reset(self) -> dict:
        with self._lock:
            self._config = self._normalized_config(get_default_admin_config())
            self._touch_locked(self._config)
            self._write_locked(self._config)
            return deepcopy(self._config)

    def _load(self) -> dict:
        with self._lock:
            return deepcopy(self._load_locked())

    def _load_locked(self) -> dict:
        if self._config is not None:
            return self._config

        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not self._config_path.exists():
            self._config = self._normalized_config(get_default_admin_config())
            self._write_locked(self._config)
            return self._config

        try:
            raw = json.loads(self._config_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail=f"Invalid admin config JSON: {exc}") from exc

        self._config = self._normalized_config(raw)
        return self._config

    def _normalized_config(self, config: dict) -> dict:
        normalized = {
            "version": int(config.get("version", 1)),
            "updatedAt": config.get("updatedAt") or self._now(),
            "agents": list(config.get("agents", [])),
            "planActions": list(config.get("planActions", [])),
        }
        for agent in normalized["agents"]:
            agent.setdefault("enabled", True)
            agent.setdefault("system", True)
        for action in normalized["planActions"]:
            action.setdefault("enabled", True)
            action.setdefault("system", False)
        return normalized

    def _touch_locked(self, config: dict) -> None:
        config["updatedAt"] = self._now()

    def _write_locked(self, config: dict) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        temp_path = self._config_path.with_suffix(".json.tmp")
        temp_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        temp_path.replace(self._config_path)

    def _now(self) -> str:
        return datetime.now(timezone.utc).astimezone().isoformat()


admin_config_repository = AdminConfigRepository()
