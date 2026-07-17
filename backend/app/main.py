import sys
from pathlib import Path

from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRouter


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
from .routers.agent_runs import router as agent_runs_router
from .routers.admin import router as admin_router
from .routers.cockpit import router as cockpit_router
from .routers.logs import router as logs_router
from .routers.runtime_data import router as runtime_data_router

app = FastAPI(title="Smart Water Plant API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")

api.include_router(ai_router)
api.include_router(agent_runs_router)
api.include_router(admin_router)
api.include_router(cockpit_router)
api.include_router(logs_router)
api.include_router(runtime_data_router)


@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(api)

frontend_dist = _frontend_dist_dir()


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    if frontend_dist is None:
        raise HTTPException(status_code=404, detail="Frontend build not found")

    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail=f"API route not found: /{full_path}")

    requested = (frontend_dist / full_path).resolve()
    root = frontend_dist.resolve()
    if requested.is_file() and requested.is_relative_to(root):
        return FileResponse(requested)

    return FileResponse(root / "index.html")
