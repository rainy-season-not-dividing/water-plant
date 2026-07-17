from typing import Any, Literal

from pydantic import BaseModel

AgentId = Literal["supervisor", "dosing", "uf", "ro", "pump"]
AgentRole = Literal["supervisor", "specialist"]
LegacyAnalysisPhase = Literal["supervisor", "agent", "sandbox"]
IncidentType = Literal["dosing_abnormal", "uf_clogging", "ro_fouling", "pump_overload"]


class AgentDefinition(BaseModel):
    id: AgentId
    name: str
    role: AgentRole
    description: str
    private_skill_namespace: str | None = None


class AgentTask(BaseModel):
    agent_id: AgentId
    incident_type: IncidentType
    task_type: str
    telemetry: dict[str, Any]
