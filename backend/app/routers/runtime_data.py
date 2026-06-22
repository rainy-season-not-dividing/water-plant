from fastapi import APIRouter

from ..services.runtime_data_service import get_plant_overview, list_alerts, list_devices

router = APIRouter(tags=["runtime-data"])


@router.get("/plant/overview")
def read_plant_overview():
    return get_plant_overview()


@router.get("/devices")
def read_devices():
    return list_devices()


@router.get("/alerts")
def read_alerts():
    return list_alerts()
