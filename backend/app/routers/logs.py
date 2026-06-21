from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..repositories.runtime_log_repository import runtime_log_repository

router = APIRouter(prefix="/logs", tags=["logs"])


class ScenarioLogEventCreate(BaseModel):
    scenarioId: str
    type: str
    agentId: str | None = None
    incidentType: str | None = None
    phase: str | None = None
    summary: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


class RuntimeLogRecord(BaseModel):
    id: str
    timestamp: str
    scenarioId: str | None = None
    type: str
    agentId: str | None = None
    incidentType: str | None = None
    phase: str | None = None
    summary: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


@router.post("/scenario", response_model=RuntimeLogRecord, status_code=201)
def create_scenario_log_event(payload: ScenarioLogEventCreate):
    return runtime_log_repository.append_scenario_event(payload.model_dump())
