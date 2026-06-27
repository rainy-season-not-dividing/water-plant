from __future__ import annotations

from typing import Any, Literal

from ..prompts import COCKPIT_CHAT_SYSTEM_PROMPT

CockpitSection = Literal["leadership", "cost-overview", "unit-analysis"]


def build_cockpit_chat_messages(
    *,
    focus_section: CockpitSection,
    selected_tab: str | None,
    question: str,
    payloads: dict[str, dict[str, Any]],
    history_summary: str,
    recent_conversation: list[dict[str, str]],
    archived_summary: str | None,
) -> list[dict[str, str]]:
    focus_label = _section_label(focus_section)
    global_payload_text = _format_all_payloads(payloads, focus_section=focus_section, selected_tab=selected_tab)
    recent_conversation_text = _format_recent_conversation(recent_conversation)
    archived_text = archived_summary.strip() if archived_summary else "无更早对话摘要。"

    user_message = f"""当前聚焦页面：{focus_label}
当前聚焦标签：{selected_tab or "默认"}
已接入上下文范围：集团总览、成本总览、单耗分析

【驾驶舱多页面数据摘要】
{global_payload_text}

【系统内历史异常记录摘要】
{history_summary}

【更早对话摘要】
{archived_text}

【最近几轮对话】
{recent_conversation_text}

【用户当前问题】
{question}

请基于全驾驶舱上下文进行回答：
1. 三个页面的数据都可以参考，但要优先围绕当前聚焦页面组织回答。
2. 如果回答依赖跨页信息，请明确指出来自哪个页面。
3. 如果历史异常记录只能提供参考，请明确说明其相关性强弱。"""

    return [
        {"role": "system", "content": COCKPIT_CHAT_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]


def _section_label(section: CockpitSection) -> str:
    return {
        "leadership": "集团总览",
        "cost-overview": "成本总览",
        "unit-analysis": "单耗分析",
    }.get(section, section)


def _format_all_payloads(
    payloads: dict[str, dict[str, Any]],
    *,
    focus_section: CockpitSection,
    selected_tab: str | None,
) -> str:
    sections = ["leadership", "cost-overview", "unit-analysis"]
    lines: list[str] = []
    for section in sections:
        payload = payloads.get(section) or {}
        section_text = _format_single_payload(
            section=section, payload=payload, selected_tab=selected_tab if section == focus_section else None
        )
        lines.append(f"[{_section_label(section)}]\n{section_text}")
    return "\n\n".join(lines)


def _format_single_payload(section: str, payload: dict[str, Any], selected_tab: str | None) -> str:
    if section == "leadership":
        cards = payload.get("cards", [])
        monthly = payload.get("charts", {}).get("monthlyWaterTrend", {})
        power = payload.get("charts", {}).get("powerPerTonTrend", {})
        card_lines = [
            f"- {item.get('title')}: {item.get('value')} {item.get('unit', '')}".strip()
            for item in cards[:4]
        ]
        return "\n".join(
            [
                f"页面标题：{payload.get('title', '')}",
                *card_lines,
                f"- 月度产水趋势: {monthly.get('categories', [])} -> {monthly.get('values', [])}",
                f"- 吨水电耗趋势: 实际 {power.get('actual', [])} / 预测 {power.get('predicted', [])}",
            ]
        )

    if section == "cost-overview":
        selected_key = selected_tab or payload.get("selectedTab")
        monthly_views = payload.get("monthlyViews", {})
        active_view = monthly_views.get(selected_key) or monthly_views.get(payload.get("selectedTab")) or {}
        headline_cards = active_view.get("headlineCards", [])
        sub_cards = active_view.get("subCards", [])
        trend = active_view.get("costTrend", {})
        return "\n".join(
            [
                f"页面标题：{payload.get('title', '')}",
                f"当前月度标签：{selected_key or '默认'}",
                *[
                    f"- {item.get('title')}: {item.get('value')} {item.get('unit', '')}".strip()
                    for item in headline_cards[:4]
                ],
                *[
                    f"- {item.get('title')}: {item.get('value')} {item.get('unit', '')}".strip()
                    for item in sub_cards[:4]
                ],
                f"- 成本趋势: {trend.get('labels', [])}",
            ]
        )

    selected_cards = payload.get("cards", [])
    core_metrics = payload.get("coreMetrics", {})
    chemical_items = payload.get("chemicalDetailItems", [])
    return "\n".join(
        [
            f"页面标题：{payload.get('title', '')}",
            *[
                f"- {item.get('title')}: {item.get('value')} {item.get('unit', '')}".strip()
                for item in selected_cards[:4]
            ],
            f"- 核心指标序列: {core_metrics.get('series', [])}",
            f"- 药剂明细: {chemical_items[:5]}",
        ]
    )


def _format_recent_conversation(history: list[dict[str, str]]) -> str:
    if not history:
        return "无最近对话。"
    normalized_lines: list[str] = []
    for item in history:
        role = item.get("role", "user")
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        prefix = "用户" if role == "user" else "助手"
        normalized_lines.append(f"{prefix}: {content}")
    return "\n".join(normalized_lines) if normalized_lines else "无最近对话。"
