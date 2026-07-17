from typing import Any, Literal

from pydantic import BaseModel

WorkflowType = Literal["incident_analysis", "decision_chain"]
WorkflowStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]


class WorkflowRun(BaseModel):
    id: str
    workflow_type: WorkflowType
    status: WorkflowStatus
    context: dict[str, Any] | None = None
