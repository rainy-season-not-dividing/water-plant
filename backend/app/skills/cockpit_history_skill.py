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
1. 数据范围：三个页面均可参考，聚焦页面决定优先视角而非数据边界。若问题可由单页完整回答，不强行引用其他页面。
2. 跨页联动的触发条件：仅当问题含对比/归因/跨页差异时才联动。反例："本月产水量"不需要联动；正例："成本上涨是否源于单耗增加"才需要。
3. 跨页联动的呈现方式：先给综合结论，再在结论中内嵌来源标注（如"成本页显示…，单耗页显示…"）。禁止新增"联动分析""综合分析"等独立小标题。
4. 历史异常记录：使用时标注匹配维度（指标类型/时间周期/关键词），匹配维度越少则相关性越弱。永远不作为当前事实陈述。
5. 表述口径：避免"根据当前页面"等暗示数据来源单一的措辞，改用"数据显示""目前情况是"等中性表述。
6. 输出结构：先结论后依据，数字对比优于纯文字。异常数据请主动标注。
7. 数据缺失：指标无数据时如实说明，禁止猜测或编造。"""

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
