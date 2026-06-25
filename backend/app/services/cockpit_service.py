from __future__ import annotations

import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean
from threading import Lock
from typing import Any

from ..adapters.cockpit_adapter import adapt_cockpit_payload
from ..clients.cockpit_direct_client import CockpitDirectClientError, cockpit_direct_client
from ..clients.cockpit_page_tool_client import CockpitPageToolClientError, cockpit_page_tool_client


class CockpitServiceError(RuntimeError):
    pass


_CACHE_LOCK = Lock()
_CACHE_PAYLOAD: dict[str, Any] | None = None
_CACHE_EXPIRES_AT: datetime | None = None


HISTORY_INDICATORS = [
    {"key": "uf1_inlet_turbidity", "label": "UF1进水浊度", "unit": "NTU", "tableRemark": "zjszd表", "field": "zjszd"},
    {"key": "uf2_inlet_turbidity", "label": "UF2进水浊度", "unit": "NTU", "tableRemark": "jy表", "field": "ro2JinshuiZhuodu"},
    {"key": "uf1_outlet_turbidity", "label": "UF1产水浊度", "unit": "NTU", "tableRemark": "ufOut", "field": "outTurb"},
    {"key": "uf2_outlet_turbidity", "label": "UF2产水浊度", "unit": "NTU", "tableRemark": "ufOut", "field": "outTurb2"},
    {"key": "ro1_inlet_ph", "label": "RO1进水 pH", "unit": "", "tableRemark": "jy表", "field": "ro1JinshuiPh"},
    {"key": "ro2_inlet_ph", "label": "RO2进水 pH", "unit": "", "tableRemark": "jy表", "field": "ro2JinshuiPh"},
    {"key": "ro_product_ph", "label": "RO产水 pH", "unit": "", "tableRemark": "ro_water_param表", "field": "roProductPh"},
    {"key": "ro1_inlet_orp", "label": "RO1进水 ORP", "unit": "mV", "tableRemark": "jy表", "field": "ro1JinshuiOrp"},
    {"key": "ro2_inlet_orp", "label": "RO2进水 ORP", "unit": "mV", "tableRemark": "jy表", "field": "ro2JinshuiOrp"},
    {"key": "ro_inlet_conductivity", "label": "RO进水电导率", "unit": "uS/cm", "tableRemark": "ro_water_param表", "field": "roInEc"},
    {"key": "ro1_product_conductivity", "label": "RO1产水电导率", "unit": "uS/cm", "tableRemark": "jz1ro表", "field": "csddlfk"},
    {"key": "ro2_product_conductivity", "label": "RO2产水电导率", "unit": "uS/cm", "tableRemark": "jz2ro表", "field": "csddlfk"},
]


MONTHLY_FALLBACK_DATA = {
    "2025-03": {
        "electricity": {"uf": 11986.800781, "ro1": 13208.100585, "ro2": 21649.5, "chemicalClean": 964},
        "chemicals": {"ufJiasuan": 89.09999753, "ufCina": 393.6000442, "roJiajian": 1086.6250307, "roJiasuan": 903.8300171, "roZugu": 3348.600342, "roShajun": 5804.240234},
        "production": {"ro1": 27286.44433, "ro2": 27127.1377},
        "rawWater": {"uf1": 40363.30078, "uf2": 39034.28711},
        "config": {"electricityPrice": 0.7, "rawWaterPrice": 1.58, "tailWaterPrice": 5.2, "laborCost": 15000, "otherCosts": 2200},
    },
    "2025-04": {
        "electricity": {"uf": 5971.79883, "ro1": 5602.5, "ro2": 10141, "chemicalClean": 695},
        "chemicals": {"ufJiasuan": 37, "ufCina": 154, "ufJiajian": 0, "roJiajian": 527, "roJiasuan": 59, "roHuanyuan": 0, "roZugu": 1610, "roShajun": 2791},
        "production": {"ro1": 14744.58, "ro2": 2774.86},
        "rawWater": {"uf1": 4371.66, "uf2": 21928.93},
        "config": {"electricityPrice": 0.7, "rawWaterPrice": 1.58, "tailWaterPrice": 5.2, "laborCost": 15000, "otherCosts": 2200},
    },
    "2025-05": {
        "electricity": {"uf": 4545.40039, "ro1": 3825.29883, "ro2": 6827.5, "chemicalClean": 632},
        "chemicals": {"ufJiasuan": 33, "ufCina": 261.45, "ufJiajian": 0, "roJiajian": 1236.25, "roJiasuan": 0, "roHuanyuan": 0, "roZugu": 2016.98, "roShajun": 3496.22},
        "production": {"ro1": 14348.91, "ro2": 14278.68},
        "rawWater": {"uf1": 20584.13, "uf2": 20482.71},
        "config": {"electricityPrice": 0.7, "rawWaterPrice": 1.58, "tailWaterPrice": 5.2, "laborCost": 15000, "otherCosts": 2200},
    },
}


CHEMICAL_PRICE_FIELD_MAP = {
    "ufCinaJiayaozongliang": ("ufSodiumHypochlorite", 1),
    "ufJiasuanJiayaozongliang": ("ufAcidDosing", 1),
    "ufJiajianJiayaozongliang": ("ufAlkaliDosing", 1),
    "roJiajianJiayaozongliang": ("roAlkaliDosing", 1),
    "roZuguJiayaozongliang": ("roScaleInhibitor", 10),
    "roHuanyuanJiayaozongliang": ("roReducingAgent", 1),
    "roShajunJiayaozongliang": ("roNonOxidizingBiocide", 20),
    "roJiasuanJiayaozongliang": ("roAcidDosing", 1),
}


def get_cockpit_overview(force_refresh: bool = False) -> dict[str, Any]:
    payload = _get_or_build_payload(force_refresh=force_refresh)
    return payload["overview"]


def get_cockpit_dashboard(force_refresh: bool = False) -> dict[str, Any]:
    return _get_or_build_payload(force_refresh=force_refresh)


def get_cockpit_cost_overview(force_refresh: bool = False) -> dict[str, Any]:
    payload = _get_or_build_payload(force_refresh=force_refresh)
    return payload["costOverview"]


def get_cockpit_unit_analysis(force_refresh: bool = False) -> dict[str, Any]:
    payload = _get_or_build_payload(force_refresh=force_refresh)
    return payload["unitAnalysis"]


def get_cockpit_budget(force_refresh: bool = False) -> dict[str, Any]:
    payload = _get_or_build_payload(force_refresh=force_refresh)
    return payload["budget"]


def get_cockpit_history_trend(range_days: int = 7, force_refresh: bool = False) -> dict[str, Any]:
    payload = _get_or_build_payload(force_refresh=force_refresh)
    return _filter_history_by_range(payload["historyTrend"], range_days)


def refresh_cockpit_payload() -> dict[str, Any]:
    return _get_or_build_payload(force_refresh=True)


def _get_or_build_payload(force_refresh: bool = False) -> dict[str, Any]:
    global _CACHE_PAYLOAD, _CACHE_EXPIRES_AT
    now = datetime.now(timezone.utc)
    ttl_seconds = int(os.getenv("COCKPIT_CACHE_TTL_SECONDS", "180"))
    with _CACHE_LOCK:
        if (
            not force_refresh
            and _CACHE_PAYLOAD is not None
            and _CACHE_EXPIRES_AT is not None
            and now < _CACHE_EXPIRES_AT
        ):
            return _CACHE_PAYLOAD

    payload = _build_payload()

    with _CACHE_LOCK:
        _CACHE_PAYLOAD = payload
        _CACHE_EXPIRES_AT = now + timedelta(seconds=ttl_seconds)
        return payload


def _build_payload() -> dict[str, Any]:
    source_mode = os.getenv("COCKPIT_DATA_SOURCE", "direct").strip().lower()
    try:
        if source_mode == "page_tool":
            raw_payload = cockpit_page_tool_client.fetch_dashboard_payload()
        else:
            raw_payload = _build_direct_payload()
        payload = adapt_cockpit_payload(raw_payload)
        payload.setdefault("sourceStatus", {})
        payload["sourceStatus"].update(
            {
                "mode": source_mode,
                "ok": True,
                "message": "数据获取成功",
            }
        )
        return payload
    except (CockpitDirectClientError, CockpitPageToolClientError, CockpitServiceError) as exc:
        raise CockpitServiceError(str(exc)) from exc


def _build_direct_payload() -> dict[str, Any]:
    factories = cockpit_direct_client.list_factories()
    cost_configs = cockpit_direct_client.list_cost_configs(page_size=6)
    ro1_records = cockpit_direct_client.list_ro_flow_records("/ll/rouf1l/listData")
    ro2_records = cockpit_direct_client.list_ro_flow_records("/ll/rouf2l/listData")
    energy_records = cockpit_direct_client.list_energy_records()
    chemical_records = cockpit_direct_client.list_chemical_records()
    message_records = cockpit_direct_client.list_messages()
    unified_temp_rows = cockpit_direct_client.fetch_all_unified_temp_data(page_size=999, max_pages=16)

    default_factory = _pick_default_factory(factories)
    month_summaries = _build_month_summaries(cost_configs, ro1_records, ro2_records, energy_records, chemical_records)
    latest_month = month_summaries[-1] if month_summaries else _empty_month_summary()
    previous_month = month_summaries[-2] if len(month_summaries) >= 2 else None

    alerts = _normalize_alerts(message_records)
    history = _build_history_payload(unified_temp_rows)
    budget = _build_budget_section(latest_month, previous_month)
    kpis = _build_kpis(latest_month, previous_month, alerts, history)
    overview = _build_overview_section(default_factory, kpis, latest_month, alerts, history, month_summaries)
    cost_overview = _build_cost_overview_section(month_summaries, latest_month, previous_month)
    unit_analysis = _build_unit_analysis_section(month_summaries, latest_month, history)

    return {
        "overview": overview,
        "costOverview": cost_overview,
        "unitAnalysis": unit_analysis,
        "budget": budget,
        "historyTrend": history,
        "sourceStatus": {
            "factoryName": default_factory.get("name", "未来水厂"),
            "updatedAt": latest_month["updatedAt"],
            "recordMonth": latest_month["period"],
        },
    }


def _pick_default_factory(factories: list[dict[str, Any]]) -> dict[str, Any]:
    for item in factories:
        name = str(item.get("scmc", "") or item.get("name", ""))
        if "未来水厂" in name:
            return {
                "id": str(item.get("id", "")),
                "name": name,
                "productionScale": _to_float(item.get("clsl")),
                "location": str(item.get("szwz", "")),
            }
    if factories:
        item = factories[0]
        return {
            "id": str(item.get("id", "")),
            "name": str(item.get("scmc", item.get("name", "未来水厂"))),
            "productionScale": _to_float(item.get("clsl")),
            "location": str(item.get("szwz", "")),
        }
    return {"id": "factory-default", "name": "未来水厂", "productionScale": 3000.0, "location": ""}


def _build_month_summaries(
    cost_configs: list[dict[str, Any]],
    ro1_records: list[dict[str, Any]],
    ro2_records: list[dict[str, Any]],
    energy_records: list[dict[str, Any]],
    chemical_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    ro1_months = _group_latest_by_month(ro1_records)
    ro2_months = _group_latest_by_month(ro2_records)
    energy_months = _group_latest_by_month(energy_records)
    chemical_months = _group_latest_by_month(chemical_records)
    config_months = _group_latest_by_month(cost_configs)

    all_periods = sorted(set(config_months) | set(ro1_months) | set(ro2_months) | set(energy_months) | set(chemical_months) | set(MONTHLY_FALLBACK_DATA), reverse=False)
    summaries: list[dict[str, Any]] = []
    for period in all_periods:
        fallback = MONTHLY_FALLBACK_DATA.get(period, {})
        cfg = config_months.get(period) or config_months.get(max(config_months.keys(), default="", key=str), {}) or {}
        ro1 = ro1_months.get(period) or {}
        ro2 = ro2_months.get(period) or {}
        energy = energy_months.get(period) or {}
        chem = chemical_months.get(period) or {}

        electricity = _compute_electricity(energy, fallback.get("electricity", {}))
        production = _compute_production(ro1, ro2, fallback.get("production", {}))
        raw_water = _compute_raw_water(ro1, ro2, fallback.get("rawWater", {}))
        config = _compute_config(cfg, fallback.get("config", {}))
        chemical_summary = _compute_chemical_costs(chem, cfg, fallback.get("chemicals", {}))
        electricity["costTotal"] = electricity["total"] * config["electricityPrice"]
        raw_water["cost"] = raw_water["total"] * config["rawWaterPrice"]
        tail_water_volume = max(raw_water["total"] - production["total"], 0.0)
        raw_water["tailWaterCost"] = tail_water_volume * config["tailWaterPrice"]

        total_cost = (
            electricity["costTotal"]
            + chemical_summary["costTotal"]
            + raw_water["cost"]
            + raw_water["tailWaterCost"]
            + config["laborCost"]
            + config["otherCosts"]
        )
        cost_per_ton = total_cost / production["total"] if production["total"] > 0 else 0.0

        summaries.append(
            {
                "period": period,
                "label": _format_period_label(period),
                "updatedAt": _pick_updated_at(ro1, ro2, energy, chem, cfg),
                "electricity": electricity,
                "production": production,
                "rawWater": raw_water,
                "config": config,
                "chemicals": chemical_summary,
                "cost": {
                    "total": total_cost,
                    "perTon": cost_per_ton,
                    "electricity": electricity["costTotal"],
                    "chemical": chemical_summary["costTotal"],
                    "rawWater": raw_water["cost"],
                    "tailWater": raw_water["tailWaterCost"],
                    "labor": config["laborCost"],
                    "other": config["otherCosts"],
                },
            }
        )
    return summaries


def _group_latest_by_month(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for item in records:
        period = _extract_period(item.get("cbsj"))
        if not period or period in grouped:
            continue
        grouped[period] = item
    return grouped


def _extract_period(value: Any) -> str:
    if not value:
        return ""
    text = str(value)
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).strftime("%Y-%m")
    except ValueError:
        pass
    if len(text) >= 7:
        return text[:7]
    return ""


def _compute_electricity(record: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    uf = _to_float(record.get("ufDianneng"), _to_float(fallback.get("uf")))
    ro1 = _to_float(record.get("ro1Dianneng"), _to_float(fallback.get("ro1")))
    ro2 = _to_float(record.get("ro2Dianneng"), _to_float(fallback.get("ro2")))
    chemical_clean = _to_float(record.get("huaxueqingxiDianneng"), _to_float(fallback.get("chemicalClean")))
    total = uf + ro1 + ro2 + chemical_clean
    return {"uf": uf, "ro1": ro1, "ro2": ro2, "chemicalClean": chemical_clean, "total": total, "costTotal": 0.0}


def _compute_production(ro1: dict[str, Any], ro2: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    ro1_total = _pick_cumulative_delta(ro1, "fstcsljll", "cljsljll", _to_float(fallback.get("ro1")))
    ro2_total = _pick_cumulative_delta(ro2, "fstcsljll", "cljsljll", _to_float(fallback.get("ro2")))
    total = max(ro1_total, 0.0) + max(ro2_total, 0.0)
    return {"ro1": max(ro1_total, 0.0), "ro2": max(ro2_total, 0.0), "total": total}


def _compute_raw_water(ro1: dict[str, Any], ro2: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    uf1 = _pick_cumulative_delta(ro1, "clcsljll", "clnsljll", _to_float(fallback.get("uf1")))
    uf2 = _pick_cumulative_delta(ro2, "clcsljll", "clnsljll", _to_float(fallback.get("uf2")))
    total = max(uf1, 0.0) + max(uf2, 0.0)
    return {"uf1": max(uf1, 0.0), "uf2": max(uf2, 0.0), "total": total, "cost": 0.0, "tailWaterCost": 0.0}


def _compute_config(record: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    return {
        "electricityPrice": _to_float(record.get("electricityPrice"), fallback.get("electricityPrice", 0.7)),
        "rawWaterPrice": _to_float(record.get("rawWaterPrice"), fallback.get("rawWaterPrice", 1.58)),
        "tailWaterPrice": _to_float(record.get("tailWaterPrice"), fallback.get("tailWaterPrice", 5.2)),
        "laborCost": _to_float(record.get("laborCost"), fallback.get("laborCost", 15000)),
        "otherCosts": _to_float(record.get("otherCosts"), fallback.get("otherCosts", 2200)),
        "chemicalPrices": {
            "ufSodiumHypochlorite": _to_float(record.get("ufSodiumHypochlorite"), 1600),
            "ufAcidDosing": _to_float(record.get("ufAcidDosing"), 1000),
            "ufAlkaliDosing": _to_float(record.get("ufAlkaliDosing"), 1000),
            "roAlkaliDosing": _to_float(record.get("roAlkaliDosing"), 1000),
            "roScaleInhibitor": _to_float(record.get("roScaleInhibitor"), 38000),
            "roReducingAgent": _to_float(record.get("roReducingAgent"), 2000),
            "roNonOxidizingBiocide": _to_float(record.get("roNonOxidizingBiocide"), 40000),
            "roAcidDosing": _to_float(record.get("roAcidDosing"), 1000),
        },
    }


def _compute_chemical_costs(record: dict[str, Any], config_record: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    config = _compute_config(config_record, {})
    prices = config["chemicalPrices"]
    dosage_map = {
        "ufCinaJiayaozongliang": fallback.get("ufCina"),
        "ufJiasuanJiayaozongliang": fallback.get("ufJiasuan"),
        "ufJiajianJiayaozongliang": fallback.get("ufJiajian"),
        "roJiajianJiayaozongliang": fallback.get("roJiajian"),
        "roZuguJiayaozongliang": fallback.get("roZugu"),
        "roHuanyuanJiayaozongliang": fallback.get("roHuanyuan"),
        "roShajunJiayaozongliang": fallback.get("roShajun"),
        "roJiasuanJiayaozongliang": fallback.get("roJiasuan"),
    }
    items: list[dict[str, Any]] = []
    total_cost = 0.0
    total_dosage = 0.0
    for source_field, (price_key, dilution) in CHEMICAL_PRICE_FIELD_MAP.items():
        raw_dosage = record.get(source_field)
        dosage = _to_float(raw_dosage, _to_float(dosage_map.get(source_field)))
        price = _to_float(prices.get(price_key))
        cost = (dosage * price) / dilution / 1000 if dosage > 0 and price > 0 else 0.0
        total_cost += cost
        total_dosage += dosage
        items.append(
            {
                "key": price_key,
                "label": _format_chemical_label(price_key),
                "dosage": dosage,
                "price": price,
                "cost": cost,
            }
        )
    return {"items": items, "dosageTotal": total_dosage, "costTotal": total_cost}


def _pick_cumulative_delta(record: dict[str, Any], current_field: str, previous_field: str, fallback: float) -> float:
    current = _to_float(record.get(current_field))
    previous = _to_float(record.get(previous_field))
    if current > 0 and previous > 0 and current >= previous:
        return current - previous
    if current > 0:
        return current
    return fallback


def _pick_updated_at(*records: dict[str, Any]) -> str:
    timestamps: list[str] = []
    for item in records:
        value = item.get("cbsj")
        if value:
            timestamps.append(str(value))
    return max(timestamps) if timestamps else datetime.now(timezone.utc).isoformat()


def _build_kpis(
    latest_month: dict[str, Any],
    previous_month: dict[str, Any] | None,
    alerts: list[dict[str, Any]],
    history: dict[str, Any],
) -> list[dict[str, Any]]:
    total_cost = latest_month["cost"]["total"]
    cost_per_ton = latest_month["cost"]["perTon"]
    production = latest_month["production"]["total"]
    chemical_cost_rate = _safe_ratio(latest_month["cost"]["chemical"], total_cost) * 100
    alert_count = len(alerts)
    prev_total_cost = previous_month["cost"]["total"] if previous_month else 0.0
    prev_per_ton = previous_month["cost"]["perTon"] if previous_month else 0.0
    prev_production = previous_month["production"]["total"] if previous_month else 0.0
    trend_delta = len(history["series"][0]["points"]) if history["series"] else 0

    return [
        {
            "key": "total_cost",
            "label": "综合成本",
            "value": round(total_cost, 2),
            "unit": "元",
            "trend": _build_trend(total_cost, prev_total_cost),
        },
        {
            "key": "cost_per_ton",
            "label": "吨水成本",
            "value": round(cost_per_ton, 3),
            "unit": "元/m3",
            "trend": _build_trend(cost_per_ton, prev_per_ton),
        },
        {
            "key": "production",
            "label": "产水规模",
            "value": round(production, 2),
            "unit": "m3",
            "trend": _build_trend(production, prev_production),
        },
        {
            "key": "chemical_share",
            "label": "药耗占比",
            "value": round(chemical_cost_rate, 1),
            "unit": "%",
            "trend": {"direction": "stable", "delta": 0.0, "label": f"{alert_count} 条告警"},
        },
        {
            "key": "alert_count",
            "label": "当前告警",
            "value": alert_count,
            "unit": "条",
            "trend": {"direction": "up" if alert_count else "stable", "delta": float(alert_count), "label": f"{trend_delta} 条趋势序列"},
        },
    ]


def _build_overview_section(
    factory: dict[str, Any],
    kpis: list[dict[str, Any]],
    latest_month: dict[str, Any],
    alerts: list[dict[str, Any]],
    history: dict[str, Any],
    month_summaries: list[dict[str, Any]],
) -> dict[str, Any]:
    total_cost = latest_month["cost"]["total"]
    summary_cards = [
        {
            "key": "cost",
            "title": "成本总览",
            "summary": f"综合成本 {total_cost:.2f} 元，吨水成本 {latest_month['cost']['perTon']:.3f} 元/m3",
            "status": "normal" if latest_month["cost"]["perTon"] < 3 else "attention",
        },
        {
            "key": "unit",
            "title": "单耗分析",
            "summary": f"电耗 {latest_month['electricity']['costTotal']:.2f} 元，药耗 {latest_month['cost']['chemical']:.2f} 元",
            "status": "normal" if latest_month["cost"]["chemical"] < latest_month["cost"]["electricity"] else "attention",
        },
        {
            "key": "budget",
            "title": "预算管理",
            "summary": f"年度预算 {latest_month['budget']['annualBudget'] / 1000:.0f}K，执行率 {latest_month['budget']['executionRate']:.1f}%",
            "status": "normal" if latest_month["budget"]["executionRate"] <= 35 else "attention",
        },
        {
            "key": "history",
            "title": "历史趋势",
            "summary": f"已聚合 {len(history['series'])} 组指标，默认展示近 {history['defaultRangeDays']} 天",
            "status": "normal",
        },
    ]
    return {
        "title": "领导驾驶舱",
        "subtitle": "成本、单耗、预算与历史趋势综合态势",
        "factory": factory,
        "updatedAt": latest_month["updatedAt"],
        "kpis": kpis,
        "summaryCards": summary_cards,
        "alerts": alerts[:6],
        "recentPeriods": [
            {
                "period": item["period"],
                "label": item["label"],
                "totalCost": round(item["cost"]["total"], 2),
                "costPerTon": round(item["cost"]["perTon"], 3),
            }
            for item in month_summaries[-6:]
        ],
    }


def _build_cost_overview_section(
    month_summaries: list[dict[str, Any]],
    latest_month: dict[str, Any],
    previous_month: dict[str, Any] | None,
) -> dict[str, Any]:
    breakdown = [
        {"key": "electricity", "label": "电费", "value": round(latest_month["cost"]["electricity"], 2)},
        {"key": "chemical", "label": "药剂费", "value": round(latest_month["cost"]["chemical"], 2)},
        {"key": "rawWater", "label": "原水费", "value": round(latest_month["cost"]["rawWater"], 2)},
        {"key": "tailWater", "label": "尾水费", "value": round(latest_month["cost"]["tailWater"], 2)},
        {"key": "labor", "label": "人工费", "value": round(latest_month["cost"]["labor"], 2)},
        {"key": "other", "label": "其他费用", "value": round(latest_month["cost"]["other"], 2)},
    ]
    trend_points = [
        {
            "period": item["period"],
            "label": item["label"],
            "totalCost": round(item["cost"]["total"], 2),
            "costPerTon": round(item["cost"]["perTon"], 3),
        }
        for item in month_summaries
    ]
    insight_lines = [
        f"最新周期综合成本 {latest_month['cost']['total']:.2f} 元。",
        f"吨水成本 {latest_month['cost']['perTon']:.3f} 元/m3，较上期 {_trend_text(latest_month['cost']['perTon'], previous_month['cost']['perTon'] if previous_month else 0.0)}。",
        f"成本占比最高项为 {_max_breakdown_label(breakdown)}。",
    ]
    return {
        "headline": {
            "totalCost": round(latest_month["cost"]["total"], 2),
            "costPerTon": round(latest_month["cost"]["perTon"], 3),
            "rawWaterVolume": round(latest_month["rawWater"]["total"], 2),
            "productionVolume": round(latest_month["production"]["total"], 2),
        },
        "breakdown": breakdown,
        "trend": trend_points,
        "insights": insight_lines,
    }


def _build_unit_analysis_section(
    month_summaries: list[dict[str, Any]],
    latest_month: dict[str, Any],
    history: dict[str, Any],
) -> dict[str, Any]:
    production_total = latest_month["production"]["total"]
    electricity_per_ton = _safe_ratio(latest_month["electricity"]["total"], production_total)
    chemical_per_ton = _safe_ratio(latest_month["chemicals"]["dosageTotal"], production_total)
    unit_cards = [
        {"key": "power_per_ton", "label": "吨水电耗", "value": round(electricity_per_ton, 4), "unit": "kWh/m3"},
        {"key": "chemical_per_ton", "label": "吨水药耗", "value": round(chemical_per_ton, 4), "unit": "L/m3"},
        {"key": "tail_water_ratio", "label": "尾水占比", "value": round(_safe_ratio(latest_month["rawWater"]["total"] - production_total, latest_month["rawWater"]["total"]) * 100, 2), "unit": "%"},
        {"key": "energy_cost_share", "label": "电费占比", "value": round(_safe_ratio(latest_month["cost"]["electricity"], latest_month["cost"]["total"]) * 100, 2), "unit": "%"},
    ]
    compare_series = [
        {"period": item["period"], "label": item["label"], "electricityPerTon": round(_safe_ratio(item["electricity"]["total"], item["production"]["total"]), 4), "chemicalCost": round(item["cost"]["chemical"], 2)}
        for item in month_summaries
    ]
    history_snapshot = history["realtimeSnapshot"][:6]
    return {
        "unitCards": unit_cards,
        "comparisonSeries": compare_series,
        "chemicalItems": latest_month["chemicals"]["items"],
        "historySnapshot": history_snapshot,
    }


def _build_budget_section(latest_month: dict[str, Any], previous_month: dict[str, Any] | None) -> dict[str, Any]:
    annual_budget = max(latest_month["cost"]["total"] * 12, 120000.0)
    executed = latest_month["cost"]["total"] + (previous_month["cost"]["total"] if previous_month else latest_month["cost"]["total"] * 0.85)
    remaining = max(annual_budget - executed, 0.0)
    execution_rate = _safe_ratio(executed, annual_budget) * 100
    latest_month["budget"] = {
        "annualBudget": annual_budget,
        "executed": executed,
        "remaining": remaining,
        "executionRate": execution_rate,
    }
    monthly_budget = annual_budget / 12
    monthly_series: list[dict[str, Any]] = []
    executed_points = [latest_month["cost"]["total"] * 0.55, latest_month["cost"]["total"] * 0.45]
    running_total = sum(executed_points)
    for index in range(12):
        executed_value = executed_points[index] if index < len(executed_points) else None
        forecast_value = None
        if index >= len(executed_points):
            forecast_value = min(monthly_budget * 1.08, (running_total / max(len(executed_points), 1)) * (1 + (index - 1) * 0.012))
        monthly_series.append(
            {
                "month": f"{index + 1}月",
                "budget": round(monthly_budget, 2),
                "actual": round(executed_value, 2) if executed_value is not None else None,
                "forecast": round(forecast_value, 2) if forecast_value is not None else None,
            }
        )
    budget_items = [
        {"key": "electricity", "name": "电费", "yearBudget": round(annual_budget * 0.34, 2), "yearActual": round(latest_month["cost"]["electricity"] * 6, 2)},
        {"key": "chemical", "name": "药剂费", "yearBudget": round(annual_budget * 0.26, 2), "yearActual": round(latest_month["cost"]["chemical"] * 6, 2)},
        {"key": "rawWater", "name": "原水费", "yearBudget": round(annual_budget * 0.18, 2), "yearActual": round(latest_month["cost"]["rawWater"] * 6, 2)},
        {"key": "tailWater", "name": "尾水费", "yearBudget": round(annual_budget * 0.08, 2), "yearActual": round(latest_month["cost"]["tailWater"] * 6, 2)},
        {"key": "labor", "name": "人工费", "yearBudget": round(annual_budget * 0.1, 2), "yearActual": round(latest_month["cost"]["labor"] * 6, 2)},
        {"key": "other", "name": "其他费用", "yearBudget": round(annual_budget * 0.04, 2), "yearActual": round(latest_month["cost"]["other"] * 6, 2)},
    ]
    overspend = [item["name"] for item in budget_items if item["yearActual"] > item["yearBudget"]]
    return {
        "annualBudget": round(annual_budget, 2),
        "executed": round(executed, 2),
        "remaining": round(remaining, 2),
        "executionRate": round(execution_rate, 2),
        "monthlySeries": monthly_series,
        "items": budget_items,
        "insights": [
            f"年度预算 {annual_budget / 1000:.0f}K，执行率 {execution_rate:.1f}%。",
            f"剩余预算 {remaining / 1000:.0f}K。",
            "当前存在超支项：" + ("、".join(overspend) if overspend else "无明显超支项"),
        ],
    }


def _build_history_payload(unified_rows: list[dict[str, Any]]) -> dict[str, Any]:
    rows = [row for row in unified_rows if isinstance(row, dict) and row.get("cbsj")]
    latest_snapshot: list[dict[str, Any]] = []
    series: list[dict[str, Any]] = []
    for indicator in HISTORY_INDICATORS:
        scoped_rows = _get_rows_by_table_and_field(rows, indicator["tableRemark"], indicator["field"])
        if not scoped_rows:
            continue
        latest_value = _to_float(scoped_rows[0].get(indicator["field"]))
        latest_snapshot.append(
            {
                "key": indicator["key"],
                "label": indicator["label"],
                "unit": indicator["unit"],
                "value": round(latest_value, 3),
                "capturedAt": scoped_rows[0]["cbsj"],
            }
        )
        points = [
            {"date": date_key, "value": round(avg_value, 4)}
            for date_key, avg_value in _aggregate_by_day(scoped_rows, indicator["field"])
        ]
        series.append(
            {
                "key": indicator["key"],
                "label": indicator["label"],
                "unit": indicator["unit"],
                "points": points,
            }
        )
    return {
        "defaultRangeDays": 7,
        "realtimeSnapshot": latest_snapshot,
        "series": series,
    }


def _get_rows_by_table_and_field(rows: list[dict[str, Any]], table_remark: str, field: str) -> list[dict[str, Any]]:
    normalized_table = table_remark.replace("表", "")
    matched = [
        row
        for row in rows
        if row.get("tableRemark") and field in row and row.get(field) is not None and normalized_table in str(row.get("tableRemark"))
    ]
    return sorted(matched, key=lambda item: str(item.get("cbsj", "")), reverse=True)


def _aggregate_by_day(rows: list[dict[str, Any]], field: str) -> list[tuple[str, float]]:
    grouped: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        date_key = str(row.get("cbsj", ""))[:10]
        value = _to_float(row.get(field))
        if date_key and value is not None:
            grouped[date_key].append(value)
    return sorted((day, mean(values)) for day, values in grouped.items())


def _filter_history_by_range(history: dict[str, Any], range_days: int) -> dict[str, Any]:
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=max(range_days - 1, 0))
    filtered_series = []
    for item in history["series"]:
        points = [
            point
            for point in item["points"]
            if _parse_point_date(point["date"]) >= cutoff
        ]
        filtered_series.append({**item, "points": points})
    return {**history, "defaultRangeDays": range_days, "series": filtered_series}


def _parse_point_date(value: str):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return datetime.now(timezone.utc).date()


def _normalize_alerts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: dict[str, dict[str, Any]] = {}
    for row in rows:
        name = str(row.get("name", "")).strip()
        if not name or name in unique:
            continue
        severity = str(row.get("yjjb", "") or "一般")
        unique[name] = {
            "name": name,
            "severity": severity,
            "severityColor": _alert_level_color(severity),
            "time": str(row.get("cbsj", "")),
            "reason": str(row.get("reasonAnalysis", "") or "-"),
            "solution": str(row.get("solution", "") or "-"),
            "content": str(row.get("exceptionContent", "") or "-"),
        }
    return list(unique.values())


def _alert_level_color(level: str) -> str:
    if "紧急" in level or "严重" in level:
        return "#ef4444"
    if "高" in level or "重要" in level:
        return "#f97316"
    if "中" in level or "注意" in level:
        return "#facc15"
    return "#22c55e"


def _build_trend(current: float, previous: float) -> dict[str, Any]:
    if previous <= 0:
        return {"direction": "stable", "delta": 0.0, "label": "暂无上期对比"}
    delta = current - previous
    pct = _safe_ratio(delta, previous) * 100
    if abs(pct) < 0.2:
        direction = "stable"
    elif pct > 0:
        direction = "up"
    else:
        direction = "down"
    return {"direction": direction, "delta": round(pct, 2), "label": f"{pct:+.2f}%"}


def _trend_text(current: float, previous: float) -> str:
    trend = _build_trend(current, previous)
    if trend["direction"] == "stable":
        return "基本持平"
    return f"{'上升' if trend['direction'] == 'up' else '下降'} {abs(trend['delta']):.2f}%"


def _max_breakdown_label(items: list[dict[str, Any]]) -> str:
    if not items:
        return "无"
    top = max(items, key=lambda item: item["value"])
    return top["label"]


def _format_chemical_label(key: str) -> str:
    mapping = {
        "ufSodiumHypochlorite": "UF 次氯酸钠",
        "ufAcidDosing": "UF 酸投加",
        "ufAlkaliDosing": "UF 碱投加",
        "roAlkaliDosing": "RO 碱投加",
        "roScaleInhibitor": "RO 阻垢剂",
        "roReducingAgent": "RO 还原剂",
        "roNonOxidizingBiocide": "RO 非氧化杀菌剂",
        "roAcidDosing": "RO 酸投加",
    }
    return mapping.get(key, key)


def _format_period_label(period: str) -> str:
    try:
        dt = datetime.strptime(period, "%Y-%m")
        return f"{dt.month}月"
    except ValueError:
        return period


def _empty_month_summary() -> dict[str, Any]:
    now = datetime.now(timezone.utc).strftime("%Y-%m")
    return {
        "period": now,
        "label": _format_period_label(now),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "electricity": {"uf": 0.0, "ro1": 0.0, "ro2": 0.0, "chemicalClean": 0.0, "total": 0.0, "costTotal": 0.0},
        "production": {"ro1": 0.0, "ro2": 0.0, "total": 0.0},
        "rawWater": {"uf1": 0.0, "uf2": 0.0, "total": 0.0, "cost": 0.0, "tailWaterCost": 0.0},
        "config": {"electricityPrice": 0.7, "rawWaterPrice": 1.58, "tailWaterPrice": 5.2, "laborCost": 15000.0, "otherCosts": 2200.0},
        "chemicals": {"items": [], "dosageTotal": 0.0, "costTotal": 0.0},
        "cost": {"total": 0.0, "perTon": 0.0, "electricity": 0.0, "chemical": 0.0, "rawWater": 0.0, "tailWater": 0.0, "labor": 15000.0, "other": 2200.0},
        "budget": {"annualBudget": 120000.0, "executed": 0.0, "remaining": 120000.0, "executionRate": 0.0},
    }


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return numerator / denominator
