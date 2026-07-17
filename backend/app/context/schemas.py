from typing import Any

from pydantic import BaseModel, Field

from ..agents.schemas import AgentId, IncidentType, LegacyAnalysisPhase


class ContextPackage(BaseModel):
    agent_id: AgentId
    incident_type: IncidentType
    phase: LegacyAnalysisPhase
    telemetry: dict[str, Any]
    history_summary: str | None = None
    rag_evidence: list[dict[str, Any]] = Field(default_factory=list)
