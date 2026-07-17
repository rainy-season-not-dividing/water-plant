import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


def build_agent_event(run_id: str, event_type: str, message: str | None = None, payload: dict[str, Any] | None = None) -> str:
    return json.dumps(
        {
            "id": f"evt-{uuid4().hex[:8]}",
            "runId": run_id,
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": message,
            "payload": payload,
        },
        ensure_ascii=False,
    )
