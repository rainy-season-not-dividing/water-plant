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
    global_summary_text = _format_global_summary(payloads, focus_section=focus_section, selected_tab=selected_tab)
    page_detail_text = _format_all_payloads(payloads, focus_section=focus_section, selected_tab=selected_tab)
    recent_conversation_text = _format_recent_conversation(recent_conversation)
    archived_text = archived_summary.strip() if archived_summary else "无更早对话摘要。"

    user_message = f"""当前聚焦页面：{focus_label}
当前聚焦标签：{selected_tab or "默认"}
上下文范围：集团总览、成本总览、单耗分析三页数据均已接入。

【驾驶舱全局摘要】
{global_summary_text}

【驾驶舱分页明细】
{page_detail_text}

【系统内历史异常记录摘要】
{history_summary}

【更早对话摘要】
{archived_text}

【最近几轮对话】
{recent_conversation_text}

【用户当前问题】
{question}

回答约束：
1. 三个页面的数据都可以参考，当前聚焦页面只决定优先展开的视角，不限制可用数据范围。
2. 只有当问题明确涉及跨页联动、页面差异、综合对比，或结论确实依赖跨页信息时，才展开联动说明。
3. 如果需要说明跨页依据，先给综合结论，再简要标明判断分别来自哪一页；不要默认单独增加“联动分析”段。
4. 如果历史异常记录只能提供参考，请明确说明其相关性强弱，不要当成当前事实。
5. 除非用户明确只问当前页，不要使用“根据当前统计页面数据”这类单页口径表述。"""

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


def _format_global_summary(
    payloads: dict[str, dict[str, Any]],
    *,
    focus_section: CockpitSection,
    selected_tab: str | None,
) -> str:
    leadership = payloads.get("leadership") or {}
    cost = payloads.get("cost-overview") or {}
    unit = payloads.get("unit-analysis") or {}

    leadership_cards = leadership.get("cards", [])
    leadership_summary = "；".join(
        f"{item.get('title')}={item.get('value')} {item.get('unit', '')}".strip()
        for item in leadership_cards[:3]
    ) or "集团总览暂无关键卡片摘要"

    cost_key = selected_tab if focus_section == "cost-overview" and selected_tab else cost.get("selectedTab")
    cost_views = cost.get("monthlyViews", {})
    active_cost_view = cost_views.get(cost_key) or cost_views.get(cost.get("selectedTab")) or {}
    cost_headlines = active_cost_view.get("headlineCards", [])
    cost_summary = "；".join(
        f"{item.get('title')}={item.get('value')} {item.get('unit', '')}".strip()
        for item in cost_headlines[:3]
    ) or "成本总览暂无关键卡片摘要"

    unit_cards = unit.get("cards", [])
    unit_summary = "；".join(
        f"{item.get('title')}={item.get('value')} {item.get('unit', '')}".strip()
        for item in unit_cards[:3]
    ) or "单耗分析暂无关键卡片摘要"

    return "\n".join(
        [
            f"- 当前优先视角：{_section_label(focus_section)}",
            f"- 集团总览核心：{leadership_summary}",
            f"- 成本总览核心：{cost_summary}",
            f"- 单耗分析核心：{unit_summary}",
            "- 分析提示：优先直接回答用户问题，只有确有必要时才补充跨页联动说明。",
        ]
    )


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
            section=section,
            payload=payload,
            selected_tab=selected_tab if section == focus_section else None,
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
                f"- 月度产水趋势：{monthly.get('categories', [])} -> {monthly.get('values', [])}",
                f"- 吨水电耗趋势：实际 {power.get('actual', [])} / 预测 {power.get('predicted', [])}",
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
                f"- 成本趋势标签：{trend.get('labels', [])}",
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
            f"- 核心指标序列：{core_metrics.get('series', [])}",
            f"- 药剂明细：{chemical_items[:5]}",
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
