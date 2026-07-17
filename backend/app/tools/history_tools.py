from typing import Any

from ..repositories.runtime_log_repository import runtime_log_repository
from .base import AgentTool


class ReadHistoryTool(AgentTool):
    name = "read_history"

    def call(self, **kwargs: Any) -> list[dict[str, Any]]:
        limit = int(kwargs.get("limit") or 20)
        return runtime_log_repository.list_scenario_events(limit=limit)
