from typing import Any

from .base import AgentTool


class RagEvidenceTool(AgentTool):
    name = "rag_evidence"

    def call(self, **_kwargs: Any) -> list[dict[str, Any]]:
        return []
