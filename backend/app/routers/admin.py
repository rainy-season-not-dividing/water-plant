from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from ..repositories.admin_config_repository import admin_config_repository
from ..repositories.runtime_log_repository import runtime_log_repository

router = APIRouter(prefix="/admin", tags=["admin"])


class MetricField(BaseModel):
    key: str
    label: str
    value: float | int | str
    unit: str = ""
    normalRange: dict | list[str] | None = None
    alarmRule: str | None = None
    shiftDirection: str | None = None


class AdminAgentConfig(BaseModel):
    id: str
    name: str
    englishName: str
    color: str
    role: str
    capabilities: list[str] = Field(default_factory=list)
    metrics: list[MetricField] = Field(default_factory=list)
    enabled: bool = True
    system: bool = True


class AdminAgentUpdate(BaseModel):
    name: str | None = None
    englishName: str | None = None
    color: str | None = None
    role: str | None = None
    capabilities: list[str] | None = None
    metrics: list[MetricField] | None = None
    enabled: bool | None = None


class AdminPlanAction(BaseModel):
    id: str
    label: str
    defaultParameter: str = ""
    defaultBasis: str = ""
    agentIds: list[str] = Field(default_factory=list)
    incidentTypes: list[str] = Field(default_factory=list)
    enabled: bool = True
    system: bool = False


class AdminPlanActionCreate(BaseModel):
    label: str
    defaultParameter: str = ""
    defaultBasis: str = ""
    agentIds: list[str] = Field(default_factory=list)
    incidentTypes: list[str] = Field(default_factory=list)
    enabled: bool = True

    @field_validator("label")
    @classmethod
    def label_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("label must not be blank")
        return value


class AdminPlanActionUpdate(BaseModel):
    label: str | None = None
    defaultParameter: str | None = None
    defaultBasis: str | None = None
    agentIds: list[str] | None = None
    incidentTypes: list[str] | None = None
    enabled: bool | None = None

    @field_validator("label")
    @classmethod
    def label_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("label must not be blank")
        return value


class AdminConfigResetResponse(BaseModel):
    ok: bool = True
    agents: list[AdminAgentConfig]
    planActions: list[AdminPlanAction]


def _audit(event_type: str, target_type: str, target_id: str, payload: dict | None = None) -> None:
    runtime_log_repository.append_audit_event(
        {
            "type": event_type,
            "targetType": target_type,
            "targetId": target_id,
            "payload": payload or {},
        }
    )


@router.get("/agents", response_model=list[AdminAgentConfig])
def list_agents():
    return admin_config_repository.list_agents()


@router.put("/agents/{agent_id}", response_model=AdminAgentConfig)
def update_agent(agent_id: str, patch: AdminAgentUpdate):
    update = patch.model_dump(exclude_unset=True)
    item = admin_config_repository.update_agent(agent_id, update)
    _audit("admin_agent_updated", "agent", agent_id, update)
    return item


@router.get("/plan-actions", response_model=list[AdminPlanAction])
def list_plan_actions():
    return admin_config_repository.list_plan_actions()


@router.post("/plan-actions", response_model=AdminPlanAction, status_code=201)
def create_plan_action(payload: AdminPlanActionCreate):
    item = admin_config_repository.create_plan_action(payload.model_dump())
    _audit("admin_plan_action_created", "planAction", item["id"], item)
    return item


@router.put("/plan-actions/{action_id}", response_model=AdminPlanAction)
def update_plan_action(action_id: str, patch: AdminPlanActionUpdate):
    update = patch.model_dump(exclude_unset=True)
    item = admin_config_repository.update_plan_action(action_id, update)
    _audit("admin_plan_action_updated", "planAction", action_id, update)
    return item


@router.delete("/plan-actions/{action_id}")
def delete_plan_action(action_id: str):
    admin_config_repository.delete_plan_action(action_id)
    _audit("admin_plan_action_deleted", "planAction", action_id)
    return {"ok": True}


@router.post("/config/reset", response_model=AdminConfigResetResponse)
def reset_admin_config():
    config = admin_config_repository.reset()
    _audit("admin_config_reset", "adminConfig", "admin_config")
    return {
        "ok": True,
        "agents": config["agents"],
        "planActions": config["planActions"],
    }
