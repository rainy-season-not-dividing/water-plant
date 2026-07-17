from typing import Any

from .base import AgentTool


class ReadTelemetryTool(AgentTool):
    name = "read_telemetry"

    def call(self, **kwargs: Any) -> dict[str, Any]:
        return dict(kwargs.get("telemetry") or {})
