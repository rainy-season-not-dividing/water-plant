from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def adapt_plant_overview(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(raw.get("id", "plant-main")),
        "name": str(raw.get("name", "Main Water Plant")),
        "status": raw.get("status", "normal"),
        "waterQuality": raw.get("waterQuality") or raw.get("water_quality") or {},
        "activeAlertCount": raw.get("activeAlertCount", raw.get("active_alert_count", 0)),
        "updatedAt": raw.get("updatedAt") or raw.get("updated_at") or datetime.now(timezone.utc).isoformat(),
    }


def adapt_devices(raw: list[dict[str, Any]] | dict[str, Any]) -> list[dict[str, Any]]:
    items = raw.get("items", []) if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        return []
    return [adapt_device(item) for item in items if isinstance(item, dict)]


def adapt_device(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(raw.get("id", "")),
        "name": str(raw.get("name", "")),
        "type": raw.get("type", "other"),
        "status": raw.get("status", "idle"),
        "simulationNodeId": raw.get("simulationNodeId") or raw.get("simulation_node_id"),
        "metrics": raw.get("metrics", []),
    }


def adapt_alerts(raw: list[dict[str, Any]] | dict[str, Any]) -> list[dict[str, Any]]:
    items = raw.get("items", []) if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        return []
    return [adapt_alert(item) for item in items if isinstance(item, dict)]


def adapt_alert(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(raw.get("id", "")),
        "severity": raw.get("severity", "info"),
        "title": str(raw.get("title", "")),
        "status": raw.get("status", "active"),
        "deviceId": raw.get("deviceId") or raw.get("device_id"),
        "createdAt": raw.get("createdAt") or raw.get("created_at") or datetime.now(timezone.utc).isoformat(),
    }
