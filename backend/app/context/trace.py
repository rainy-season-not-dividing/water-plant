from datetime import datetime, timezone
from uuid import uuid4

from .schemas import ContextPackage


def build_context_trace(context_package: ContextPackage) -> dict:
    return {
        "id": f"ctx-{uuid4().hex[:8]}",
        "agentId": context_package.agent_id,
        "phase": context_package.phase,
        "incidentType": context_package.incident_type,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
