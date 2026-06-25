from __future__ import annotations

from fastapi import APIRouter, Query

from ..services.cockpit_service import (
    get_cockpit_budget,
    get_cockpit_cost_overview,
    get_cockpit_dashboard,
    get_cockpit_history_trend,
    get_cockpit_overview,
    get_cockpit_unit_analysis,
    refresh_cockpit_payload,
)

router = APIRouter(prefix="/cockpit", tags=["cockpit"])


@router.get("/overview")
def read_cockpit_overview(
    refresh: bool = Query(default=False),
):
    return get_cockpit_overview(force_refresh=refresh)


@router.get("/dashboard")
def read_cockpit_dashboard(
    refresh: bool = Query(default=False),
):
    return get_cockpit_dashboard(force_refresh=refresh)


@router.get("/cost-overview")
def read_cockpit_cost_overview(
    refresh: bool = Query(default=False),
):
    return get_cockpit_cost_overview(force_refresh=refresh)


@router.get("/unit-analysis")
def read_cockpit_unit_analysis(
    refresh: bool = Query(default=False),
):
    return get_cockpit_unit_analysis(force_refresh=refresh)


@router.get("/budget")
def read_cockpit_budget(
    refresh: bool = Query(default=False),
):
    return get_cockpit_budget(force_refresh=refresh)


@router.get("/history-trend")
def read_cockpit_history_trend(
    range_days: int = Query(default=7, ge=1, le=90),
    refresh: bool = Query(default=False),
):
    return get_cockpit_history_trend(range_days=range_days, force_refresh=refresh)


@router.post("/refresh")
def refresh_cockpit():
    return refresh_cockpit_payload()
