from collections.abc import AsyncGenerator
from typing import Any

from ..agents.registry import get_legacy_phase_agent
from ..agents.schemas import IncidentType, LegacyAnalysisPhase
from ..context.builder import build_analysis_user_message, build_legacy_context_package
from ..safety.sandbox import build_sandbox_messages
from ..services.llm import stream_chat


async def stream_legacy_phase_analysis(
    *,
    incident_type: IncidentType,
    phase: LegacyAnalysisPhase,
    telemetry: dict[str, Any],
) -> AsyncGenerator[str, None]:
    agent = get_legacy_phase_agent(phase, incident_type)
    context_package = build_legacy_context_package(
        agent_id=agent.definition.id,
        incident_type=incident_type,
        phase=phase,
        telemetry=telemetry,
    )

    if phase == "sandbox":
        system_prompt, user_message = build_sandbox_messages(incident_type, telemetry)
    else:
        system_prompt = agent.system_prompt
        user_message = build_analysis_user_message(context_package)

    async for event in stream_chat(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.7,
        max_tokens=1024,
    ):
        yield event
