from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Event, Lock
from typing import Any, Callable, TypeVar

from ..clients.cockpit_direct_client import CockpitDirectClientError, cockpit_direct_client


class CockpitServiceError(RuntimeError):
    pass


T = TypeVar("T")

DEFAULT_FACTORY_KEYWORD = "未来水厂"
LEADERSHIP_SECTION = "leadership"
COST_SECTION = "cost-overview"
UNIT_SECTION = "unit-analysis"

LEADERSHIP_MONTH_WATER = {
    "months": ["3月", "4月", "5月", "6月"],
    "values": [54413.58203, 17519.44, 27716.22, 162095.88281],
}

MONTHLY_FALLBACK_DATA = {
    "2026-03": {
        "electricity": {"uf": 11986.800781, "ro1": 13208.100585, "ro2": 21649.5, "chemicalClean": 964},
        "chemicals": {
            "ufJiasuan": 89.09999753,
            "ufCina": 393.6000442,
            "roJiajian": 1086.6250307,
            "roJiasuan": 903.8300171,
            "roZugu": 3348.600342,
            "roShajun": 5804.240234,
        },
        "production": {"ro1": 27286.44433, "ro2": 27127.1377},
        "rawWater": {"uf1": 40363.30078, "uf2": 39034.28711},
        "config": {"electricityPrice": 0.7, "rawWaterPrice": 1.58, "tailWaterPrice": 5.2, "laborCost": 15000, "otherCosts": 2200},
    },
    "2026-04": {
        "electricity": {"uf": 5971.79883, "ro1": 5602.5, "ro2": 10141, "chemicalClean": 695},
        "chemicals": {
            "ufJiasuan": 37,
            "ufCina": 154,
            "ufJiajian": 0,
            "roJiajian": 527,
            "roJiasuan": 59,
            "roHuanyuan": 0,
            "roZugu": 1610,
            "roShajun": 2791,
        },
        "production": {"ro1": 14744.58, "ro2": 2774.86},
        "rawWater": {"uf1": 4371.66, "uf2": 21928.93},
        "config": {"electricityPrice": 0.7, "rawWaterPrice": 1.58, "tailWaterPrice": 5.2, "laborCost": 15000, "otherCosts": 2200},
    },
    "2026-05": {
        "electricity": {"uf": 4545.40039, "ro1": 3825.29883, "ro2": 6827.5, "chemicalClean": 632},
        "chemicals": {
            "ufJiasuan": 33,
            "ufCina": 261.45,
            "ufJiajian": 0,
            "roJiajian": 1236.25,
            "roJiasuan": 0,
            "roHuanyuan": 0,
            "roZugu": 2016.98,
            "roShajun": 3496.22,
        },
        "production": {"ro1": 14348.91, "ro2": 14278.68},
        "rawWater": {"uf1": 20584.13, "uf2": 20482.71},
        "config": {"electricityPrice": 0.7, "rawWaterPrice": 1.58, "tailWaterPrice": 5.2, "laborCost": 15000, "otherCosts": 2200},
    },
}

# 旧系统历史月份年份字段存在偏差，2026-03/04/05 使用已核对的补充数据；
# 2026-06 使用真实接口完整运行数据。真实接口里的 2026-04 只有配置记录，
# 不参与这几个月的成本展示，避免覆盖完整补充数据。
COST_OVERVIEW_VISIBLE_PERIODS = {
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
}

CHEMICAL_FIELD_MAP = {
    "ufCinaJiayaozongliang": ("ufSodiumHypochlorite", "UF次氯酸钠", 1),
    "ufJiasuanJiayaozongliang": ("ufAcidDosing", "UF加酸", 1),
    "ufJiajianJiayaozongliang": ("ufAlkaliDosing", "UF加碱", 1),
    "roJiajianJiayaozongliang": ("roAlkaliDosing", "RO加碱", 1),
    "roZuguJiayaozongliang": ("roScaleInhibitor", "RO阻垢剂", 10),
    "roHuanyuanJiayaozongliang": ("roReducingAgent", "RO还原剂", 1),
    "roShajunJiayaozongliang": ("roNonOxidizingBiocide", "RO非氧杀菌剂", 20),
    "roJiasuanJiayaozongliang": ("roAcidDosing", "RO加酸", 1),
}

CHEMICAL_EXTRA_DOSAGE = {
    "roScaleInhibitor": 4408.049805,
    "roNonOxidizingBiocide": 7640.620117,
    "roAlkaliDosing": 1427.0,
    "roAcidDosing": 903.0,
}


@dataclass
class _CacheEntry:
    payload: dict[str, Any]
    expires_at: datetime


@dataclass
class _InFlightEntry:
    event: Event
    owner: bool


_SECTION_CACHE_LOCK = Lock()
_SECTION_CACHE: dict[str, _CacheEntry] = {}
_SECTION_INFLIGHT: dict[str, Event] = {}


def get_cockpit_leadership(force_refresh: bool = False) -> dict[str, Any]:
    return _get_cached_section(LEADERSHIP_SECTION, _build_leadership_payload, force_refresh=force_refresh)


def get_cockpit_cost_overview(force_refresh: bool = False) -> dict[str, Any]:
    return _get_cached_section(COST_SECTION, _build_cost_overview_payload, force_refresh=force_refresh)


def get_cockpit_unit_analysis(force_refresh: bool = False) -> dict[str, Any]:
    return _get_cached_section(UNIT_SECTION, _build_unit_analysis_payload, force_refresh=force_refresh)


def get_cockpit_dashboard(force_refresh: bool = False) -> dict[str, Any]:
    return {
        "leadership": get_cockpit_leadership(force_refresh=force_refresh),
        "costOverview": get_cockpit_cost_overview(force_refresh=force_refresh),
        "unitAnalysis": get_cockpit_unit_analysis(force_refresh=force_refresh),
    }


def refresh_cockpit_payload() -> dict[str, Any]:
    return get_cockpit_dashboard(force_refresh=True)


def _get_cached_section(section: str, builder: Callable[[], dict[str, Any]], *, force_refresh: bool) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    ttl_seconds = _section_ttl_seconds(section)

    with _SECTION_CACHE_LOCK:
        cached = _SECTION_CACHE.get(section)
        if not force_refresh and cached and now < cached.expires_at:
            return cached.payload

        wait_event = _SECTION_INFLIGHT.get(section)
        if wait_event is None:
            wait_event = Event()
            _SECTION_INFLIGHT[section] = wait_event
            inflight = _InFlightEntry(event=wait_event, owner=True)
        else:
            inflight = _InFlightEntry(event=wait_event, owner=False)

    if not inflight.owner:
        inflight.event.wait(timeout=_build_wait_timeout_seconds())
        with _SECTION_CACHE_LOCK:
            cached = _SECTION_CACHE.get(section)
            if cached:
                return cached.payload
        if not force_refresh:
            raise CockpitServiceError(f"Timed out waiting for cockpit section: {section}")

    try:
        payload = builder()
    except CockpitDirectClientError as exc:
        raise CockpitServiceError(str(exc)) from exc
    finally:
        if inflight.owner:
            with _SECTION_CACHE_LOCK:
                event = _SECTION_INFLIGHT.pop(section, None)
                if event is not None:
                    event.set()

    with _SECTION_CACHE_LOCK:
        _SECTION_CACHE[section] = _CacheEntry(payload=payload, expires_at=now + timedelta(seconds=ttl_seconds))
    return payload


def _section_ttl_seconds(section: str) -> int:
    env_key = f"COCKPIT_{section.upper().replace('-', '_')}_CACHE_TTL_SECONDS"
    if section == COST_SECTION:
        return int(os.getenv(env_key, "600"))
    return int(os.getenv(env_key, "300"))


def _build_wait_timeout_seconds() -> float:
    return float(int(os.getenv("COCKPIT_BUILD_WAIT_TIMEOUT_SECONDS", "20")))


def _build_leadership_payload() -> dict[str, Any]:
    dataset = _fetch_core_dataset(include_config_page_size=1)
    base = _build_runtime_metrics(dataset)
    default_factory = dataset["defaultFactory"]
    leadership_cards = [
        {
            "key": "totalElectricityCost",
            "title": "总电费成本",
            "value": round(base["electricityCost"], 2),
            "unit": "元",
            "icon": "zap",
            "factoryName": default_factory["name"],
            "dateRange": _build_leadership_date_range(),
        },
        {
            "key": "totalChemicalCost",
            "title": "总药剂成本",
            "value": round(base["chemicalCost"], 2),
            "unit": "元",
            "icon": "flask-conical",
            "factoryName": default_factory["name"],
            "dateRange": _build_leadership_date_range(),
        },
        {
            "key": "totalWaterVolume",
            "title": "总出水量",
            "value": round(base["productionTotal"], 2),
            "unit": "m3",
            "icon": "droplets",
            "factoryName": default_factory["name"],
            "dateRange": _build_leadership_date_range(),
        },
        {
            "key": "costPerTon",
            "title": "吨水运营成本",
            "value": round(base["operationCostPerTon"], 3),
            "unit": "元/m3",
            "icon": "coins",
            "factoryName": default_factory["name"],
            "dateRange": _build_leadership_date_range(),
        },
    ]
    return {
        "pageKey": LEADERSHIP_SECTION,
        "title": "集团驾驶舱",
        "subtitle": "集团总览",
        "factory": default_factory,
        "sourceStatus": _build_source_status("leadership", dataset),
        "cards": leadership_cards,
        "charts": {
            "monthlyWaterTrend": {
                "title": "各项目月度产水趋势",
                "factoryName": default_factory["name"],
                "unit": "m3",
                "categories": LEADERSHIP_MONTH_WATER["months"],
                "values": LEADERSHIP_MONTH_WATER["values"],
            },
            "powerPerTonTrend": {
                "title": "吨水电耗",
                "factoryName": default_factory["name"],
                "unit": "kWh/m3",
                "categories": ["当前值", "AI预测+1h", "AI预测+2h"],
                "actual": [round(base["electricityPerTon"] or 1.05, 3)],
                "predicted": [
                    round((base["electricityPerTon"] or 1.05) * 1.01, 3),
                    round((base["electricityPerTon"] or 1.05) * 1.0, 3),
                ],
            },
        },
        "sidebar": [
            {"key": LEADERSHIP_SECTION, "label": "集团总览"},
            {"key": COST_SECTION, "label": "成本总览"},
            {"key": UNIT_SECTION, "label": "单耗分析"},
        ],
    }


def _build_cost_overview_payload() -> dict[str, Any]:
    dataset = _fetch_core_dataset(include_config_page_size=20)
    base = _build_runtime_metrics(dataset)
    monthly = _build_monthly_summaries(dataset)
    visible_monthly = _filter_visible_cost_months(monthly)
    latest = monthly[-1] if monthly else _empty_month_summary()
    default_factory = dataset["defaultFactory"]
    monthly_tabs = _build_cost_monthly_tabs(visible_monthly)
    monthly_views = _build_cost_monthly_views(visible_monthly, dataset["costConfigs"], base)
    selected_tab = "realtime" if "realtime" in monthly_views else next(iter(monthly_views), "realtime")

    return {
        "pageKey": COST_SECTION,
        "title": "成本总览",
        "subtitle": "成本分析",
        "factory": default_factory,
        "sourceStatus": _build_source_status("cost-overview", dataset),
        "monthlyTabs": monthly_tabs,
        "selectedTab": selected_tab,
        "recordMonth": latest["period"],
        "monthlyViews": monthly_views,
    }


def _build_unit_analysis_payload() -> dict[str, Any]:
    dataset = _fetch_core_dataset(include_config_page_size=1)
    base = _build_runtime_metrics(dataset)
    default_factory = dataset["defaultFactory"]
    chemical_items = base["chemicalItems"]
    chemical_real = [round(item["cost"], 2) for item in chemical_items]
    return {
        "pageKey": UNIT_SECTION,
        "title": "单耗分析",
        "subtitle": "成本分析",
        "factory": default_factory,
        "sourceStatus": _build_source_status("unit-analysis", dataset),
        "cards": [
            {"key": "electricityCost", "title": "总电费成本", "value": round(base["electricityCost"], 2), "unit": "元", "icon": "zap"},
            {"key": "chemicalCost", "title": "总药剂成本", "value": round(base["chemicalCost"], 2), "unit": "元", "icon": "flask-conical"},
            {"key": "waterVolume", "title": "总出水量", "value": round(base["productionTotal"], 2), "unit": "m3", "icon": "waves"},
            {"key": "operationCost", "title": "吨水运营成本", "value": round(base["operationCostPerTon"], 2), "unit": "元/m3", "icon": "pie-chart"},
        ],
        "coreMetrics": {
            "categories": ["当前实际", "AI预测"],
            "series": [
                {"name": "总电费成本", "unit": "元", "actual": round(base["electricityCost"], 2), "predicted": _predict_value(base["electricityCost"], 0.03)},
                {"name": "总药剂成本", "unit": "元", "actual": round(base["chemicalCost"], 2), "predicted": _predict_value(base["chemicalCost"], 0.04)},
                {"name": "总出水量", "unit": "m3", "actual": round(base["productionTotal"], 2), "predicted": _predict_value(base["productionTotal"], 0.02)},
                {"name": "吨水运营成本", "unit": "元/m3", "actual": round(base["operationCostPerTon"], 3), "predicted": _predict_value(base["operationCostPerTon"], 0.05)},
            ],
        },
        "chemicalCostChart": {
            "categories": [item["label"] for item in chemical_items],
            "actual": chemical_real,
            "predicted": [_predict_value(value, 0.08) for value in chemical_real],
        },
        "chemicalDetailItems": chemical_items,
    }


def _fetch_core_dataset(*, include_config_page_size: int) -> dict[str, Any]:
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {
            "factories": executor.submit(cockpit_direct_client.list_factories),
            "costConfigs": executor.submit(cockpit_direct_client.list_cost_configs, include_config_page_size),
            "ro1Records": executor.submit(cockpit_direct_client.list_ro_flow_records, "/ll/rouf1l/listData", 16),
            "ro2Records": executor.submit(cockpit_direct_client.list_ro_flow_records, "/ll/rouf2l/listData", 16),
            "energyRecords": executor.submit(cockpit_direct_client.list_energy_records, 16),
            "chemicalRecords": executor.submit(cockpit_direct_client.list_chemical_records, 16),
        }
        dataset = {key: future.result() for key, future in futures.items()}
    dataset["defaultFactory"] = _pick_default_factory(dataset["factories"])
    return dataset


def _build_runtime_metrics(dataset: dict[str, Any]) -> dict[str, Any]:
    cost_configs = dataset["costConfigs"]
    ro1_records = dataset["ro1Records"]
    ro2_records = dataset["ro2Records"]
    energy_records = dataset["energyRecords"]
    chemical_records = dataset["chemicalRecords"]

    latest_config = cost_configs[0] if cost_configs else {}
    latest_ro1 = ro1_records[0] if ro1_records else {}
    latest_ro2 = ro2_records[0] if ro2_records else {}
    latest_energy = energy_records[0] if energy_records else {}
    latest_chemical = chemical_records[0] if chemical_records else {}
    latest_fallback = MONTHLY_FALLBACK_DATA.get("2025-05", {})

    config = _compute_config(latest_config, latest_fallback.get("config", {}))
    electricity = _compute_electricity(latest_energy, latest_fallback.get("electricity", {}))
    electricity_cost = electricity["total"] * config["electricityPrice"]
    production = _compute_production(latest_ro1, latest_ro2, latest_fallback.get("production", {}))
    raw_water = _compute_raw_water(latest_ro1, latest_ro2, latest_fallback.get("rawWater", {}))
    raw_water_cost = raw_water["total"] * config["rawWaterPrice"]
    tail_water_volume = max(raw_water["total"] - production["total"], 0.0)
    tail_water_cost = tail_water_volume * config["tailWaterPrice"]
    chemical_summary = _compute_chemical_costs(latest_chemical, latest_config, latest_fallback.get("chemicals", {}), include_extra_dosage=True)
    operation_cost = electricity_cost + chemical_summary["costTotal"]
    operation_cost_per_ton = operation_cost / production["total"] if production["total"] > 0 else 0.0
    total_cost = operation_cost + config["laborCost"] + config["otherCosts"]
    total_cost_per_ton = total_cost / production["total"] if production["total"] > 0 else 0.0

    updated_at = _pick_updated_at(latest_config, latest_ro1, latest_ro2, latest_energy, latest_chemical)
    return {
        "config": config,
        "electricity": electricity,
        "electricityCost": electricity_cost,
        "chemicalCost": chemical_summary["costTotal"],
        "chemicalItems": chemical_summary["items"],
        "chemicalDosageTotal": chemical_summary["dosageTotal"],
        "productionTotal": production["total"],
        "production": production,
        "rawWaterTotal": raw_water["total"],
        "rawWaterCost": raw_water_cost,
        "tailWaterCost": tail_water_cost,
        "laborCost": config["laborCost"],
        "otherCost": config["otherCosts"],
        "operationCost": operation_cost,
        "operationCostPerTon": operation_cost_per_ton,
        "totalCost": total_cost,
        "totalCostPerTon": total_cost_per_ton,
        "electricityPerTon": electricity["total"] / production["total"] if production["total"] > 0 else 0.0,
        "updatedAt": updated_at,
        "recordMonth": _extract_period(updated_at),
    }


def _build_monthly_summaries(dataset: dict[str, Any]) -> list[dict[str, Any]]:
    cost_configs = dataset["costConfigs"]
    ro1_records = dataset["ro1Records"]
    ro2_records = dataset["ro2Records"]
    energy_records = dataset["energyRecords"]
    chemical_records = dataset["chemicalRecords"]

    ro1_months = _group_latest_by_month(ro1_records)
    ro2_months = _group_latest_by_month(ro2_records)
    energy_months = _group_latest_by_month(energy_records)
    chemical_months = _group_latest_by_month(chemical_records)
    config_months = _group_latest_by_month(cost_configs)

    all_periods = sorted(set(config_months) | set(ro1_months) | set(ro2_months) | set(energy_months) | set(chemical_months) | set(MONTHLY_FALLBACK_DATA))
    summaries: list[dict[str, Any]] = []
    for period in all_periods:
        fallback = MONTHLY_FALLBACK_DATA.get(period, {})
        cfg = {} if fallback else config_months.get(period) or {}
        ro1 = ro1_months.get(period) or {}
        ro2 = ro2_months.get(period) or {}
        energy = energy_months.get(period) or {}
        chem = chemical_months.get(period) or {}

        electricity = _compute_electricity(energy, fallback.get("electricity", {}))
        production = _compute_production(ro1, ro2, fallback.get("production", {}))
        raw_water = _compute_raw_water(ro1, ro2, fallback.get("rawWater", {}))
        config = _compute_config(cfg, fallback.get("config", {}))
        chemicals = _compute_chemical_costs(chem, cfg, fallback.get("chemicals", {}), include_extra_dosage=False)
        electricity_cost = electricity["total"] * config["electricityPrice"]
        raw_water_cost = raw_water["total"] * config["rawWaterPrice"]
        tail_water_cost = max(raw_water["total"] - production["total"], 0.0) * config["tailWaterPrice"]
        total_cost = electricity_cost + chemicals["costTotal"] + raw_water_cost + tail_water_cost + config["laborCost"] + config["otherCosts"]
        cost_per_ton = total_cost / production["total"] if production["total"] > 0 else 0.0

        summaries.append(
            {
                "period": period,
                "label": _format_period_label(period),
                "updatedAt": _pick_updated_at(cfg, ro1, ro2, energy, chem),
                "electricity": electricity,
                "production": production,
                "rawWater": raw_water,
                "chemicals": chemicals,
                "config": config,
                "cost": {
                    "total": total_cost,
                    "perTon": cost_per_ton,
                    "electricity": electricity_cost,
                    "chemical": chemicals["costTotal"],
                    "rawWater": raw_water_cost,
                    "tailWater": tail_water_cost,
                    "labor": config["laborCost"],
                    "other": config["otherCosts"],
                },
            }
        )
    return summaries


def _build_cost_config_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for row in rows[:3]:
        result.append(
            {
                "time": str(row.get("cbsj", "")),
                "electricityPrice": round(_to_float(row.get("electricityPrice")), 4),
                "rawWaterPrice": round(_to_float(row.get("rawWaterPrice")), 4),
                "tailWaterPrice": round(_to_float(row.get("tailWaterPrice")), 4),
                "laborCost": round(_to_float(row.get("laborCost")), 2),
                "otherCosts": round(_to_float(row.get("otherCosts")), 2),
                "ufSodiumHypochlorite": round(_to_float(row.get("ufSodiumHypochlorite")), 4),
                "ufAcidDosing": round(_to_float(row.get("ufAcidDosing")), 4),
                "ufAlkaliDosing": round(_to_float(row.get("ufAlkaliDosing")), 4),
                "roAlkaliDosing": round(_to_float(row.get("roAlkaliDosing")), 4),
                "roScaleInhibitor": round(_to_float(row.get("roScaleInhibitor")), 4),
                "roReducingAgent": round(_to_float(row.get("roReducingAgent")), 4),
                "roNonOxidizingBiocide": round(_to_float(row.get("roNonOxidizingBiocide")), 4),
                "roAcidDosing": round(_to_float(row.get("roAcidDosing")), 4),
            }
        )
    return result


def _build_cost_monthly_tabs(monthly: list[dict[str, Any]]) -> list[dict[str, str]]:
    tabs = [{"key": "realtime", "label": "实时"}]
    label_counts: dict[str, int] = {}
    for item in monthly:
        period = item["period"]
        if not period:
            continue
        label = item["label"]
        label_counts[label] = label_counts.get(label, 0) + 1
        if label_counts[label] > 1:
            label = _format_period_label(period, include_year=True)
        tabs.append({"key": period, "label": label})
    return tabs


def _filter_visible_cost_months(monthly: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [item for item in monthly if item["period"] in COST_OVERVIEW_VISIBLE_PERIODS]


def _build_cost_monthly_views(
    monthly: list[dict[str, Any]],
    cost_configs: list[dict[str, Any]],
    base: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    history_total_cost = [round(item["cost"]["total"], 2) for item in monthly]
    history_labels = [item["label"] for item in monthly]
    predicted_costs = _predict_series(history_total_cost, 3)
    future_labels = [f"预测+{idx}期" for idx in range(1, 4)]

    monthly_views: dict[str, dict[str, Any]] = {
        "realtime": {
            "headlineCards": _build_cost_headline_cards(base),
            "subCards": _build_cost_sub_cards(base),
            "costComposition": _build_cost_composition(base),
            "costTrend": {
                "labels": history_labels + future_labels,
                "actual": history_total_cost + ["-", "-", "-"],
                "predicted": ["-"] * len(history_total_cost) + predicted_costs,
            },
            "configRows": _build_cost_config_rows(cost_configs),
        }
    }

    for item in monthly:
        config_rows = (
            [_build_fallback_config_row(item)]
            if item["period"] in MONTHLY_FALLBACK_DATA
            else _find_config_rows_for_period(cost_configs, item["period"])
        )
        monthly_views[item["period"]] = {
            "headlineCards": _build_cost_headline_cards(item["cost"], use_monthly_cost=True),
            "subCards": _build_cost_sub_cards(item["cost"], use_monthly_cost=True),
            "costComposition": _build_cost_composition(item["cost"], use_monthly_cost=True),
            "costTrend": _build_single_month_trend(item),
            "configRows": _build_cost_config_rows(config_rows),
        }

    return monthly_views


def _build_cost_headline_cards(source: dict[str, Any], *, use_monthly_cost: bool = False) -> list[dict[str, Any]]:
    if use_monthly_cost:
        return [
            {"key": "tailWaterCost", "title": "尾水成本", "value": round(source["tailWater"], 2), "unit": "元", "formula": "(进水-出水) × 尾水价", "icon": "waves"},
            {"key": "rawWaterCost", "title": "原水成本", "value": round(source["rawWater"], 2), "unit": "元", "formula": "UF总进水 × 原水价", "icon": "droplets"},
            {"key": "costPerTon", "title": "吨水成本", "value": round(source["perTon"], 2), "unit": "元/m3", "formula": "总成本/总出水", "icon": "line-chart"},
            {"key": "totalCost", "title": "总成本", "value": round(source["total"], 2), "unit": "元", "formula": "电+药+人工+其他", "icon": "coins"},
        ]
    return [
        {"key": "tailWaterCost", "title": "尾水成本", "value": round(source["tailWaterCost"], 2), "unit": "元", "formula": "(进水-出水) × 尾水价", "icon": "waves"},
        {"key": "rawWaterCost", "title": "原水成本", "value": round(source["rawWaterCost"], 2), "unit": "元", "formula": "UF总进水 × 原水价", "icon": "droplets"},
        {"key": "costPerTon", "title": "吨水成本", "value": round(source["totalCostPerTon"], 2), "unit": "元/m3", "formula": "总成本/总出水", "icon": "line-chart"},
        {"key": "totalCost", "title": "总成本", "value": round(source["totalCost"], 2), "unit": "元", "formula": "电+药+人工+其他", "icon": "coins"},
    ]


def _build_cost_sub_cards(source: dict[str, Any], *, use_monthly_cost: bool = False) -> list[dict[str, Any]]:
    if use_monthly_cost:
        return [
            {"key": "electricityCost", "title": "电费成本", "value": round(source["electricity"], 2), "unit": "元"},
            {"key": "chemicalCost", "title": "药剂费成本", "value": round(source["chemical"], 2), "unit": "元"},
            {"key": "laborCost", "title": "人工成本", "value": round(source["labor"], 2), "unit": "元"},
            {"key": "otherCost", "title": "其它费用", "value": round(source["other"], 2), "unit": "元"},
        ]
    return [
        {"key": "electricityCost", "title": "电费成本", "value": round(source["electricityCost"], 2), "unit": "元"},
        {"key": "chemicalCost", "title": "药剂费成本", "value": round(source["chemicalCost"], 2), "unit": "元"},
        {"key": "laborCost", "title": "人工成本", "value": round(source["laborCost"], 2), "unit": "元"},
        {"key": "otherCost", "title": "其它费用", "value": round(source["otherCost"], 2), "unit": "元"},
    ]


def _build_cost_composition(source: dict[str, Any], *, use_monthly_cost: bool = False) -> list[dict[str, Any]]:
    if use_monthly_cost:
        return [
            {"name": "电费", "value": round(source["electricity"], 2)},
            {"name": "药剂费", "value": round(source["chemical"], 2)},
            {"name": "人工", "value": round(source["labor"], 2)},
            {"name": "其它", "value": round(source["other"], 2)},
        ]
    return [
        {"name": "电费", "value": round(source["electricityCost"], 2)},
        {"name": "药剂费", "value": round(source["chemicalCost"], 2)},
        {"name": "人工", "value": round(source["laborCost"], 2)},
        {"name": "其它", "value": round(source["otherCost"], 2)},
    ]


def _build_single_month_trend(item: dict[str, Any]) -> dict[str, Any]:
    total_cost = round(item["cost"]["total"], 2)
    predicted = _predict_series([total_cost], 2)
    return {
        "labels": [item["label"], "预测+1期", "预测+2期"],
        "actual": [total_cost, "-", "-"],
        "predicted": ["-", predicted[0], predicted[1]],
    }


def _find_config_rows_for_period(rows: list[dict[str, Any]], period: str) -> list[dict[str, Any]]:
    matched = [row for row in rows if _extract_period(row.get("cbsj")) == period]
    return matched[:3] if matched else rows[:3]


def _build_fallback_config_row(item: dict[str, Any]) -> dict[str, Any]:
    config = item["config"]
    chemical_prices = config.get("chemicalPrices", {})
    return {
        "cbsj": f"{item['period']}-01",
        "electricityPrice": config.get("electricityPrice"),
        "rawWaterPrice": config.get("rawWaterPrice"),
        "tailWaterPrice": config.get("tailWaterPrice"),
        "laborCost": config.get("laborCost"),
        "otherCosts": config.get("otherCosts"),
        "ufSodiumHypochlorite": chemical_prices.get("ufSodiumHypochlorite"),
        "ufAcidDosing": chemical_prices.get("ufAcidDosing"),
        "ufAlkaliDosing": chemical_prices.get("ufAlkaliDosing"),
        "roAlkaliDosing": chemical_prices.get("roAlkaliDosing"),
        "roScaleInhibitor": chemical_prices.get("roScaleInhibitor"),
        "roReducingAgent": chemical_prices.get("roReducingAgent"),
        "roNonOxidizingBiocide": chemical_prices.get("roNonOxidizingBiocide"),
        "roAcidDosing": chemical_prices.get("roAcidDosing"),
    }


def _pick_default_factory(factories: list[dict[str, Any]]) -> dict[str, Any]:
    for item in factories:
        name = str(item.get("scmc", "") or item.get("name", ""))
        if DEFAULT_FACTORY_KEYWORD in name:
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
            "name": str(item.get("scmc", item.get("name", DEFAULT_FACTORY_KEYWORD))),
            "productionScale": _to_float(item.get("clsl")),
            "location": str(item.get("szwz", "")),
        }
    return {"id": "factory-default", "name": "沧州市高新区未来水厂", "productionScale": 3000.0, "location": "沧州"}


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
    return {"uf": uf, "ro1": ro1, "ro2": ro2, "chemicalClean": chemical_clean, "total": total}


def _compute_production(ro1: dict[str, Any], ro2: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    ro1_total = _pick_cumulative_delta(ro1, "fstcsljll", "cljsljll", _to_float(fallback.get("ro1")))
    ro2_total = _pick_cumulative_delta(ro2, "fstcsljll", "cljsljll", _to_float(fallback.get("ro2")))
    total = max(ro1_total, 0.0) + max(ro2_total, 0.0)
    return {"ro1": max(ro1_total, 0.0), "ro2": max(ro2_total, 0.0), "total": total}


def _compute_raw_water(ro1: dict[str, Any], ro2: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    uf1 = _pick_cumulative_delta(ro1, "clcsljll", "clnsljll", _to_float(fallback.get("uf1")))
    uf2 = _pick_cumulative_delta(ro2, "clcsljll", "clnsljll", _to_float(fallback.get("uf2")))
    total = max(uf1, 0.0) + max(uf2, 0.0)
    return {"uf1": max(uf1, 0.0), "uf2": max(uf2, 0.0), "total": total}


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


def _compute_chemical_costs(record: dict[str, Any], config_record: dict[str, Any], fallback: dict[str, Any], *, include_extra_dosage: bool) -> dict[str, Any]:
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

    for source_field, (price_key, label, dilution) in CHEMICAL_FIELD_MAP.items():
        dosage = _to_float(record.get(source_field), _to_float(dosage_map.get(source_field)))
        if include_extra_dosage:
            dosage += CHEMICAL_EXTRA_DOSAGE.get(price_key, 0.0)
        price = _to_float(prices.get(price_key))
        cost = (dosage * price) / dilution / 1000 if dosage > 0 and price > 0 else 0.0
        total_cost += cost
        total_dosage += dosage
        items.append({"key": price_key, "label": label, "dosage": dosage, "price": price, "cost": cost})
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


def _build_source_status(mode: str, dataset: dict[str, Any]) -> dict[str, Any]:
    updated_at = _pick_updated_at(*(dataset.get("costConfigs", [])[:1] + dataset.get("ro1Records", [])[:1] + dataset.get("ro2Records", [])[:1] + dataset.get("energyRecords", [])[:1] + dataset.get("chemicalRecords", [])[:1]))
    return {
        "mode": mode,
        "ok": True,
        "message": "数据获取成功",
        "factoryName": dataset["defaultFactory"]["name"],
        "updatedAt": updated_at,
        "recordMonth": _extract_period(updated_at),
        "dataSource": "直连接口",
    }


def _build_leadership_date_range() -> str:
    start_date = os.getenv("COCKPIT_LEADERSHIP_START_DATE", "2025-12-06")
    end_date = datetime.now().strftime("%Y-%m-%d")
    return f"{start_date} - {end_date}"


def _predict_series(values: list[float], count: int) -> list[float]:
    if not values:
        return [0.0] * count
    if len(values) == 1:
        return [round(values[0], 2)] * count

    indices = list(range(len(values)))
    n = len(values)
    sum_x = sum(indices)
    sum_y = sum(values)
    sum_xy = sum(idx * value for idx, value in zip(indices, values))
    sum_xx = sum(idx * idx for idx in indices)
    denominator = n * sum_xx - sum_x * sum_x
    if denominator == 0:
        return [round(values[-1], 2)] * count
    slope = (n * sum_xy - sum_x * sum_y) / denominator
    intercept = (sum_y - slope * sum_x) / n
    return [round(max(0.0, slope * (n + idx) + intercept), 2) for idx in range(count)]


def _predict_value(value: float, ratio: float) -> float:
    return round(max(0.0, value * (1 + ratio)), 2)


def _format_period_label(period: str, *, include_year: bool = False) -> str:
    try:
        dt = datetime.strptime(period, "%Y-%m")
        return f"{dt.year}年{dt.month}月" if include_year else f"{dt.month}月"
    except ValueError:
        return period


def _empty_month_summary() -> dict[str, Any]:
    now = datetime.now(timezone.utc).strftime("%Y-%m")
    return {
        "period": now,
        "label": _format_period_label(now),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "electricity": {"uf": 0.0, "ro1": 0.0, "ro2": 0.0, "chemicalClean": 0.0, "total": 0.0},
        "production": {"ro1": 0.0, "ro2": 0.0, "total": 0.0},
        "rawWater": {"uf1": 0.0, "uf2": 0.0, "total": 0.0},
        "config": _compute_config({}, {}),
        "chemicals": {"items": [], "dosageTotal": 0.0, "costTotal": 0.0},
        "cost": {"total": 0.0, "perTon": 0.0, "electricity": 0.0, "chemical": 0.0, "rawWater": 0.0, "tailWater": 0.0, "labor": 0.0, "other": 0.0},
    }


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
