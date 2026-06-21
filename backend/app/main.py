import sys
from pathlib import Path

from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRouter
from pydantic import BaseModel
from datetime import datetime, timezone
from uuid import uuid4


def _runtime_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def _resource_dir() -> Path:
    bundle_dir = getattr(sys, "_MEIPASS", None)
    if bundle_dir:
        return Path(bundle_dir)
    return Path(__file__).resolve().parents[2]


def _frontend_dist_dir() -> Path | None:
    candidates = [
        _resource_dir() / "frontend_dist",
        _runtime_dir() / "frontend_dist",
        Path(__file__).resolve().parents[2] / "frontend" / "dist",
    ]
    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate
    return None


load_dotenv(_runtime_dir() / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from .routers.ai import router as ai_router
from .routers.admin import router as admin_router
from .routers.logs import router as logs_router

app = FastAPI(title="Smart Water Plant API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")

api.include_router(ai_router)
api.include_router(admin_router)
api.include_router(logs_router)


@api.get("/plant/overview")
def get_plant_overview():
    return {
        "id": "plant-main",
        "name": "Main Water Plant",
        "status": "normal",
        "waterQuality": {
            "turbidity": 0.42,
            "ph": 7.2,
            "residualChlorine": 0.35,
        },
        "activeAlertCount": 0,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }


@api.get("/devices")
def list_devices():
    return [
        {
            "id": "pump-001",
            "name": "Intake Pump 1",
            "type": "pump",
            "status": "running",
            "simulationNodeId": "pump-001",
            "metrics": [
                {"key": "flow_rate", "label": "Flow Rate", "value": 1280, "unit": "m3/h"}
            ],
        },
        {
            "id": "dosing-001",
            "name": "Dosing Unit A",
            "type": "dosing-unit",
            "status": "running",
            "simulationNodeId": "dosing-001",
            "metrics": [
                {"key": "dosage", "label": "Dosage", "value": 2.5, "unit": "mg/L"}
            ],
        },
        {
            "id": "filter-uf-001",
            "name": "UF Membrane Module 1",
            "type": "filter",
            "status": "running",
            "simulationNodeId": "filter-uf-001",
            "metrics": [
                {"key": "pressure_diff", "label": "Pressure Diff", "value": 0.8, "unit": "bar"}
            ],
        },
        {
            "id": "filter-ro-001",
            "name": "RO Membrane Module 1",
            "type": "filter",
            "status": "running",
            "simulationNodeId": "filter-ro-001",
            "metrics": [
                {"key": "rejection_rate", "label": "Rejection Rate", "value": 99.2, "unit": "%"}
            ],
        },
    ]


@api.get("/alerts")
def list_alerts():
    return []


class CreateAgentRunRequest(BaseModel):
    goal: str
    context: dict | None = None


@api.post("/agent/runs", status_code=202)
def create_agent_run(req: CreateAgentRunRequest):
    return {
        "id": f"run-{uuid4().hex[:8]}",
        "status": "queued",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(api)

frontend_dist = _frontend_dist_dir()


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    if frontend_dist is None:
        raise HTTPException(status_code=404, detail="Frontend build not found")

    requested = (frontend_dist / full_path).resolve()
    root = frontend_dist.resolve()
    if requested.is_file() and requested.is_relative_to(root):
        return FileResponse(requested)

    return FileResponse(root / "index.html")
