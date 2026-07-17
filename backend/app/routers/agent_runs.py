from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.agent_run_service import create_agent_run

router = APIRouter(prefix="/agent", tags=["Agent Runtime"])


class CreateAgentRunRequest(BaseModel):
    goal: str
    context: dict[str, Any] | None = None


@router.post("/runs", status_code=202)
def create_run(req: CreateAgentRunRequest):
    return create_agent_run(goal=req.goal, context=req.context)
