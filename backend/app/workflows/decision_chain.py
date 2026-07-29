from collections.abc import AsyncGenerator
import json
from typing import Any

from ..agents.registry import get_legacy_phase_agent
from ..agents.schemas import IncidentType, LegacyAnalysisPhase
from ..context.builder import build_analysis_user_message, build_legacy_context_package
from ..safety.sandbox import build_sandbox_messages
from ..services.llm import stream_chat
from ..tools.rag_tools import RagRetrievalFailed, rag_evidence_tool


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
    try:
        rag_bundle = rag_evidence_tool.call_with_status(
            agent_id=agent.definition.id,
            incident_type=incident_type,
            phase=phase,
            telemetry=telemetry,
        )
    except RagRetrievalFailed as exc:
        yield json.dumps(
            {
                "type": "error",
                "message": str(exc),
                "ragStatus": exc.status,
                "failedSources": exc.failed_sources,
                "errorMessage": str(exc),
            },
            ensure_ascii=False,
        )
        return

    context_package.rag_evidence = rag_bundle.evidence

    if phase == "sandbox":
        system_prompt, user_message = build_sandbox_messages(
            incident_type,
            telemetry,
            rag_evidence=context_package.rag_evidence,
        )
    else:
        system_prompt = agent.system_prompt
        user_message = build_analysis_user_message(context_package)

    status_message = _rag_status_message(rag_bundle)
    if status_message:
        yield json.dumps({"type": "token", "content": status_message}, ensure_ascii=False)

    async for event in stream_chat(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.7,
        max_tokens=1024,
    ):
        yield event


def _rag_status_message(rag_bundle: Any) -> str:
    if rag_bundle.status == "hybrid":
        return "知识检索状态：ES BM25 与 Qdrant Vector 双路召回完成，已通过 RRF 融合后进入分析。\n\n"
    if rag_bundle.status == "degraded_bm25_only":
        return "知识检索状态：Qdrant Vector 暂不可用，本次降级为 ES BM25 单路召回，仍已执行统一后处理。\n\n"
    if rag_bundle.status == "degraded_vector_only":
        return "知识检索状态：ES BM25 暂不可用，本次降级为 Qdrant Vector 单路召回，仍已执行统一后处理。\n\n"
    if rag_bundle.status == "no_results":
        return "知识检索状态：ES BM25 与 Qdrant Vector 均未命中可用知识，本次将仅基于运行基准和遥测数据分析。\n\n"
    if rag_bundle.status == "disabled":
        return "知识检索状态：RAG 当前未启用，本次将仅基于运行基准和遥测数据分析。\n\n"
    return ""
