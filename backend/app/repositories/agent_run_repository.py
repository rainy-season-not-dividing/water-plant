from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


class AgentRunRepository:
    def __init__(self) -> None:
        self._runs: dict[str, dict[str, Any]] = {}

    def create(self, *, goal: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        run = {
            "id": f"run-{uuid4().hex[:8]}",
            "status": "queued",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "goal": goal,
            "context": context,
        }
        self._runs[run["id"]] = run
        return deepcopy({key: run[key] for key in ("id", "status", "createdAt")})


agent_run_repository = AgentRunRepository()
