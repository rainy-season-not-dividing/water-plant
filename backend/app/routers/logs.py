from typing import Any

from fastapi import APIRouter, Query
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


@router.get("/scenario", response_model=list[RuntimeLogRecord])
def list_scenario_log_events(
    limit: int = Query(default=100, ge=1, le=500),
    scenario_id: str | None = Query(default=None, alias="scenarioId"),
):
    return runtime_log_repository.list_scenario_events(limit=limit, scenario_id=scenario_id)
