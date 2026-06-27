import json
import asyncio
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..services.llm import stream_analysis
from ..services.cockpit_ai_service import stream_cockpit_chat

router = APIRouter(prefix="/ai", tags=["AI"])


class AIAnalyzeRequest(BaseModel):
    incident_type: Literal["dosing_abnormal", "uf_clogging", "ro_fouling", "pump_overload"]
    phase: Literal["supervisor", "agent", "sandbox"]
    telemetry: dict


class CockpitChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class CockpitChatRequest(BaseModel):
    section: Literal["leadership", "cost-overview", "unit-analysis"]
    selected_tab: str | None = None
    question: str
    history: list[CockpitChatHistoryMessage] = []
    archived_summary: str | None = None


@router.post("/analyze")
async def analyze(req: AIAnalyzeRequest):
    async def event_generator():
        try:
            async for data in stream_analysis(
                incident_type=req.incident_type,
                phase=req.phase,
                telemetry=req.telemetry,
            ):
                yield {"data": data}
        except Exception as e:
            yield {"data": json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False)}

    return EventSourceResponse(event_generator())


@router.post("/cockpit/chat")
async def cockpit_chat(req: CockpitChatRequest):
    async def event_generator():
        try:
            async for data in stream_cockpit_chat(
                section=req.section,
                selected_tab=req.selected_tab,
                question=req.question,
                history=[item.model_dump() for item in req.history],
                archived_summary=req.archived_summary,
            ):
                yield {"data": data}
        except Exception as e:
            yield {"data": json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False)}

    return EventSourceResponse(event_generator())
