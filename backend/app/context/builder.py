from typing import Any

from ..agents.schemas import AgentId, IncidentType, LegacyAnalysisPhase
from ..prompts import INCIDENT_CONTEXT
from .schemas import ContextPackage


def build_legacy_context_package(
    *,
    agent_id: AgentId,
    incident_type: IncidentType,
    phase: LegacyAnalysisPhase,
    telemetry: dict[str, Any],
) -> ContextPackage:
    return ContextPackage(
        agent_id=agent_id,
        incident_type=incident_type,
        phase=phase,
        telemetry=telemetry,
    )


def build_analysis_user_message(context_package: ContextPackage) -> str:
    context = INCIDENT_CONTEXT.get(context_package.incident_type, "")
    telemetry_text = "\n".join(f"  {k}: {v}" for k, v in context_package.telemetry.items())
    return f"""{context}

当前遥测数据：
{telemetry_text}

请开始分析。"""
