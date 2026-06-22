from __future__ import annotations

import os
from datetime import datetime, timezone

from ..adapters.runtime_data_adapter import adapt_alerts, adapt_devices, adapt_plant_overview
from ..clients.external_data_client import external_data_client


def get_plant_overview() -> dict:
    if _use_external_data():
        return adapt_plant_overview(external_data_client.get_json("/plant/overview"))
    return _mock_plant_overview()


def list_devices() -> list[dict]:
    if _use_external_data():
        return adapt_devices(external_data_client.get_json("/devices"))
    return _mock_devices()


def list_alerts() -> list[dict]:
    if _use_external_data():
        return adapt_alerts(external_data_client.get_json("/alerts"))
    return []


def _use_external_data() -> bool:
    return os.getenv("DATA_SOURCE", "mock").lower() == "external"


def _mock_plant_overview() -> dict:
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


def _mock_devices() -> list[dict]:
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
