from __future__ import annotations

from datetime import datetime
from hashlib import sha1
import json
import logging
import os
from pathlib import Path
from typing import Any


LOGGER = logging.getLogger("app.rag.retrieval")


def log_retrieval_event(event: dict[str, Any]) -> None:
    """Write one structured retrieval event to the app logger and optional JSONL file."""

    payload = dict(event)
    query = str(payload.get("query") or "")
    payload.setdefault("event", "rag_retrieval")
    payload.setdefault("timestamp", datetime.now().astimezone().isoformat(timespec="milliseconds"))
    if query:
        payload.setdefault("query_hash", sha1(query.encode("utf-8")).hexdigest())
        if not _env_bool("RAG_RETRIEVAL_LOG_INCLUDE_QUERY", default=True):
            payload.pop("query", None)

    line = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    LOGGER.info(line)

    log_path = os.getenv("RAG_RETRIEVAL_LOG_PATH", "").strip()
    if not log_path:
        return
    path = Path(log_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"{line}\n")


def _env_bool(name: str, *, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}
