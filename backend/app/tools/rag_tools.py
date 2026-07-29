from dataclasses import dataclass
from typing import Any

from ..context.incident_context import INCIDENT_CONTEXT
from ..rag.schemas import RetrievalRequest, RetrievalResponse, RetrievalStatus
from ..rag.service import rag_service
from .base import AgentTool


@dataclass(slots=True)
class RagEvidenceBundle:
    evidence: list[dict[str, Any]]
    status: RetrievalStatus
    failed_sources: list[str]
    errors: dict[str, str]


class RagRetrievalFailed(RuntimeError):
    def __init__(self, response: RetrievalResponse) -> None:
        message = "知识检索服务不可用，ES BM25 与 Qdrant Vector 均未返回可用结果。"
        super().__init__(message)
        self.response = response
        self.status = response.status
        self.failed_sources = response.failed_sources
        self.errors = response.errors


class RagEvidenceTool(AgentTool):
    name = "rag_evidence"

    def call(self, **kwargs: Any) -> list[dict[str, Any]]:
        return self.call_with_status(**kwargs).evidence

    def call_with_status(self, **kwargs: Any) -> RagEvidenceBundle:
        top_k = int(kwargs.get("top_k") or 5)
        agent_id = str(kwargs.get("agent_id") or "")
        incident_type = str(kwargs.get("incident_type") or "")
        phase = str(kwargs.get("phase") or "")
        telemetry = kwargs.get("telemetry") if isinstance(kwargs.get("telemetry"), dict) else {}

        primary = _retrieve_or_raise(
            RetrievalRequest(
                query=build_evidence_query(
                    agent_id=agent_id,
                    incident_type=incident_type,
                    phase=phase,
                    telemetry=telemetry,
                    include_phase_terms=False,
                ),
                top_k=max(top_k * 3, top_k),
            )
        )
        secondary = _retrieve_or_raise(
            RetrievalRequest(
                query=_phase_evidence_query(agent_id=agent_id, phase=phase),
                top_k=2,
            )
        )
        evidence = [_result_to_evidence(result) for result in _dedupe_results([*primary.results, *secondary.results])[:top_k]]
        return RagEvidenceBundle(
            evidence=evidence,
            status=_combine_status([primary.status, secondary.status], has_evidence=bool(evidence)),
            failed_sources=_union([*primary.failed_sources, *secondary.failed_sources]),
            errors={**primary.errors, **secondary.errors},
        )


def build_evidence_query(
    *,
    agent_id: str,
    incident_type: str,
    phase: str,
    telemetry: dict[str, Any],
    include_phase_terms: bool = True,
) -> str:
    telemetry_terms = " ".join(str(key) for key in telemetry)
    incident_context = INCIDENT_CONTEXT.get(incident_type, "")
    return "\n".join(
        item
        for item in [
            f"incident_type: {incident_type}",
            f"phase: {phase}",
            f"agent_id: {agent_id}",
            incident_context,
            _incident_query_terms(incident_type),
            f"telemetry_keys: {telemetry_terms}",
            _phase_query_terms(phase) if include_phase_terms else "",
        ]
        if item.strip()
    )


def _incident_query_terms(incident_type: str) -> str:
    if incident_type == "dosing_abnormal":
        return (
            "加药分域 加药系统 药耗异常 加药系统异常 加药异常 RO阻垢剂投加偏差 UF清洗药剂状态异常 加药泵流量偏差 "
            "加药分域 UF清洗加药 RO保护加药 药箱液位 投加偏差 药耗异常"
        )
    if incident_type == "uf_clogging":
        return (
            "UF处置顺序 超滤膜污堵 UF TMP升高 跨膜压差 产水浊度 SDI异常 反洗恢复不足 "
            "自清洗过滤器 物理反洗 CEB CED CIP评估 RO进水安全 清洗残留"
        )
    if incident_type == "ro_fouling":
        return (
            "RO处置顺序 RO产水TDS RO前置保护 反渗透膜污染 RO结垢 一级RO产水TDS 段间压差 脱盐率下降 产水量下降 "
            "UF回看 阻垢剂 回收率 高压泵 CIP评估"
        )
    if incident_type == "pump_overload":
        return (
            "泵组判断边界 泵组运行异常 泵组过载 电流超标 温度升高 流量不足 压力不足 "
            "UF工艺负荷 RO工艺负荷 泵组负载 阀组状态 SCADA点位"
        )
    return ""


def _phase_query_terms(phase: str) -> str:
    if phase == "supervisor":
        return "监管总管 根因分析 风险等级 置信度 异常指标 偏离程度 关联影响 工艺顺序 建议单"
    if phase == "agent":
        return "专项智能体 建议方案 前置条件 操作时序 安全联锁 复核指标 需人工确认"
    if phase == "sandbox":
        return (
            "安全沙箱 AI副驾驶权限边界 自动下发PLC 自动调泵 自动加药 自动反洗 自动CIP "
            "工艺顺序 生产连续性 人工确认 现场检测"
        )
    return ""


def _phase_evidence_query(*, agent_id: str, phase: str) -> str:
    return "\n".join(
        item
        for item in [
            f"phase: {phase}",
            f"agent_id: {agent_id}",
            _phase_query_terms(phase),
        ]
        if item.strip()
    )


def _result_to_evidence(result: Any) -> dict[str, Any]:
    metadata = result.chunk.metadata
    extra = metadata.extra
    return {
        "rank": result.rank,
        "score": result.score,
        "text": result.chunk.text,
        "source": metadata.source,
        "source_locator": extra.get("source_locator"),
        "section_path": extra.get("section_path"),
        "retrieval_sources": extra.get("retrieval_sources"),
    }


def _dedupe_results(results: list[Any]) -> list[Any]:
    deduped: list[Any] = []
    seen: set[str] = set()
    for result in results:
        key = str(result.chunk.metadata.extra.get("source_locator") or result.chunk.id)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(result)
    return deduped


def _retrieve_or_raise(request: RetrievalRequest) -> RetrievalResponse:
    response = rag_service.retrieve(request)
    if response.failed:
        raise RagRetrievalFailed(response)
    return response


def _combine_status(statuses: list[RetrievalStatus], *, has_evidence: bool) -> RetrievalStatus:
    if not statuses or all(status == "disabled" for status in statuses):
        return "disabled"
    degraded = [status for status in statuses if status in {"degraded_bm25_only", "degraded_vector_only"}]
    if degraded:
        return degraded[0]
    if has_evidence and "hybrid" in statuses:
        return "hybrid"
    if not has_evidence:
        return "no_results"
    return statuses[0]


def _union(values: list[str]) -> list[str]:
    return sorted({value for value in values if value})


rag_evidence_tool = RagEvidenceTool()

__all__ = [
    "RagEvidenceBundle",
    "RagEvidenceTool",
    "RagRetrievalFailed",
    "build_evidence_query",
    "rag_evidence_tool",
]
