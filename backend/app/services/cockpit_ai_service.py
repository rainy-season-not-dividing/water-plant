from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any, Literal

from ..repositories.runtime_log_repository import runtime_log_repository
from ..services.cockpit_service import (
    get_cockpit_cost_overview,
    get_cockpit_leadership,
    get_cockpit_unit_analysis,
)
from ..services.llm import stream_chat
from ..skills.cockpit_history_skill import build_cockpit_chat_messages

CockpitSection = Literal["leadership", "cost-overview", "unit-analysis"]

_INCIDENT_LABELS = {
    "dosing_abnormal": "加药异常",
    "uf_clogging": "超滤污堵",
    "ro_fouling": "反渗透污染/结垢",
    "pump_overload": "泵组过载",
}

_INCIDENT_KEYWORDS = {
    "dosing_abnormal": ["加药", "药剂", "阻垢剂", "清洗药剂", "投加", "药耗"],
    "uf_clogging": ["uf", "超滤", "tmp", "浊度", "sdi", "反洗", "ceb", "ced"],
    "ro_fouling": ["ro", "反渗透", "tds", "压差", "脱盐率", "cip", "膜污染", "结垢"],
    "pump_overload": ["泵", "电流", "温度", "负载", "转速", "压力", "流量"],
}

_SECTION_KEYWORDS = {
    "leadership": ["总览", "经营", "整体", "趋势", "产水", "全厂"],
    "cost-overview": ["成本", "电费", "药剂", "吨水", "费用", "构成"],
    "unit-analysis": ["单耗", "药耗", "电耗", "分项", "核心指标"],
}


async def stream_cockpit_chat(
    *,
    section: CockpitSection,
    selected_tab: str | None,
    question: str,
    history: list[dict[str, str]],
    archived_summary: str | None = None,
) -> AsyncGenerator[str, None]:
    payloads = _load_all_payloads()
    history_summary = _summarize_relevant_history(section=section, question=question)
    recent_history = history[-8:]
    messages = build_cockpit_chat_messages(
        focus_section=section,
        selected_tab=selected_tab,
        question=question,
        payloads=payloads,
        history_summary=history_summary,
        recent_conversation=recent_history,
        archived_summary=archived_summary,
    )

    async for event in stream_chat(
        messages=messages,
        temperature=0.4,
        max_tokens=1500,
    ):
        yield event


def _load_all_payloads() -> dict[str, dict[str, Any]]:
    return {
        "leadership": get_cockpit_leadership(force_refresh=False),
        "cost-overview": get_cockpit_cost_overview(force_refresh=False),
        "unit-analysis": get_cockpit_unit_analysis(force_refresh=False),
    }


def _summarize_relevant_history(*, section: CockpitSection, question: str, limit: int = 5) -> str:
    events = runtime_log_repository.list_scenario_events(limit=280)
    if not events:
        return "暂无历史异常处置记录。"

    grouped = _aggregate_scenarios(events)
    if not grouped:
        return "暂无可用的历史异常处置记录。"

    scored = [(_score_record(record, section=section, question=question), record) for record in grouped.values()]
    filtered = [record for score, record in scored if score > 0]
    ranked = (
        sorted(filtered, key=lambda record: _score_record(record, section=section, question=question), reverse=True)
        if filtered
        else [record for _, record in sorted(scored, key=lambda item: item[0], reverse=True)]
    )

    lines: list[str] = []
    for index, record in enumerate(ranked[:limit], start=1):
        label = _INCIDENT_LABELS.get(record["incidentType"], record["incidentType"])
        lines.append(
            "\n".join(
                [
                    f"案例{index}：{label}，时间 {record['startedAt']}",
                    f"- 场景标题：{record['incidentTitle']}",
                    f"- 检测遥测摘要：{record['telemetrySummary']}",
                    f"- 监管分析摘要：{record['supervisorSummary']}",
                    f"- 专项分析摘要：{record['agentSummary']}",
                    f"- 处置结果摘要：{record['planSummary']}",
                ]
            )
        )
    return "\n\n".join(lines) if lines else "暂无历史异常处置记录。"


def _aggregate_scenarios(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    ordered_events = list(reversed(events))
    for event in ordered_events:
        scenario_id = event.get("scenarioId")
        incident_type = event.get("incidentType")
        if not scenario_id or not incident_type:
            continue
        current = grouped.setdefault(
            scenario_id,
            {
                "scenarioId": scenario_id,
                "incidentType": incident_type,
                "incidentTitle": event.get("summary") or "历史异常记录",
                "startedAt": event.get("timestamp", ""),
                "telemetrySummary": "无",
                "supervisorSummary": "无",
                "agentSummary": "无",
                "planSummary": "无",
            },
        )
        event_type = event.get("type")
        payload = event.get("payload") or {}
        if event_type == "scenario_started":
            telemetry = payload.get("telemetry")
            current["telemetrySummary"] = _summarize_telemetry(incident_type, telemetry)
            if event.get("summary"):
                current["incidentTitle"] = event["summary"]
            if event.get("timestamp"):
                current["startedAt"] = event["timestamp"]
        elif event_type == "supervisor_analysis":
            current["supervisorSummary"] = _safe_shorten(payload.get("text") or event.get("summary") or "无")
        elif event_type == "agent_analysis":
            current["agentSummary"] = _safe_shorten(payload.get("text") or event.get("summary") or "无")
        elif event_type in {"human_confirmation", "human_rejection"}:
            current["planSummary"] = _safe_shorten(event.get("summary") or "无")
        elif event_type == "scenario_closed" and current["planSummary"] == "无":
            current["planSummary"] = _safe_shorten(event.get("summary") or "已完成处置闭环")
    return grouped


def _score_record(record: dict[str, Any], *, section: CockpitSection, question: str) -> int:
    score = 0
    normalized_question = question.lower()
    incident_type = record.get("incidentType", "")
    for keyword in _SECTION_KEYWORDS.get(section, []):
        if keyword in question:
            score += 2
    for keyword in _INCIDENT_KEYWORDS.get(incident_type, []):
        normalized_keyword = keyword.lower()
        if normalized_keyword in normalized_question or keyword in question:
            score += 4
    if section == "cost-overview" and incident_type in {"dosing_abnormal", "pump_overload"}:
        score += 2
    if section == "unit-analysis" and incident_type in {"uf_clogging", "ro_fouling", "pump_overload"}:
        score += 2
    if section == "leadership":
        score += 1
    if record.get("planSummary") and record["planSummary"] != "无":
        score += 1
    return score


def _summarize_telemetry(incident_type: str, telemetry: Any) -> str:
    if not isinstance(telemetry, dict):
        return "无遥测摘要。"
    focus_keys = {
        "dosing_abnormal": ["dosingRate", "chemicalLevel", "roTds", "roPressureDiff"],
        "uf_clogging": ["inletTurbidity", "outletTurbidity", "ufPressure", "energyConsumption"],
        "ro_fouling": ["roTds", "roPressureDiff", "roFlux", "ufPressure"],
        "pump_overload": ["pumpSpeed", "pumpCurrent", "pumpTemperature", "inletFlow"],
    }.get(incident_type, [])
    parts = []
    for key in focus_keys:
        if key in telemetry:
            parts.append(f"{key}={telemetry[key]}")
    if not parts:
        preview = {key: telemetry[key] for key in list(telemetry)[:4]}
        return json.dumps(preview, ensure_ascii=False)
    return "，".join(parts)


def _safe_shorten(text: Any, limit: int = 180) -> str:
    raw = str(text or "").strip().replace("\r", " ").replace("\n", " ")
    if not raw:
        return "无"
    return raw[:limit] + ("..." if len(raw) > limit else "")
