import json
import asyncio
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..services.llm import stream_analysis

router = APIRouter(prefix="/ai", tags=["AI"])


class AIAnalyzeRequest(BaseModel):
    incident_type: Literal["dosing_abnormal", "uf_clogging", "ro_fouling", "pump_overload"]
    phase: Literal["supervisor", "agent", "sandbox"]
    telemetry: dict


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
