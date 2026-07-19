import json
from pathlib import Path
from typing import Any


PROCESS_BASELINE_PATH = Path(__file__).resolve().parents[2] / "data" / "process_baseline.json"
PROCESS_BASELINE: dict[str, dict[str, Any]] = {}


_INCIDENT_BASELINE_AREAS: dict[str, tuple[str, ...]] = {
    "dosing_abnormal": ("project", "uf", "ro", "dosing"),
    "uf_clogging": ("project", "uf", "ro"),
    "ro_fouling": ("project", "uf", "ro", "dosing"),
    "pump_overload": ("project", "uf", "ro", "pump"),
}


def format_process_baseline(incident_type: str | None = None) -> str:
    baseline = load_process_baseline()
    areas = _INCIDENT_BASELINE_AREAS.get(str(incident_type or ""), tuple(PROCESS_BASELINE))
    lines = [
        "以下为结构化运行基准，仅用于分析口径和建议依据；凡标注需现场确认的值，不得作为自动控制阈值。"
    ]
    for area_key in areas:
        area = baseline[area_key]
        lines.append(f"[{area['label']}]")
        for entry in area["entries"].values():
            lines.append(f"- {entry['label']}：{_format_entry_value(entry)}；来源：{entry['source']}；{_confirmation_text(entry)}")
    return "\n".join(lines)


def load_process_baseline() -> dict[str, dict[str, Any]]:
    if PROCESS_BASELINE:
        return PROCESS_BASELINE
    data = json.loads(PROCESS_BASELINE_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("process baseline JSON must contain an object.")
    PROCESS_BASELINE.update(data)
    return PROCESS_BASELINE


def _format_entry_value(entry: dict[str, Any]) -> str:
    unit = str(entry.get("unit") or "")
    if "value" in entry:
        value = _join_value_unit(entry["value"], unit)
    elif "min" in entry and "max" in entry:
        value = _join_value_unit(f"{entry['min']}-{entry['max']}", unit)
    elif "min" in entry:
        value = _join_value_unit(f">={entry['min']}", unit)
    elif "max" in entry:
        value = _join_value_unit(f"<{entry['max']}", unit)
    else:
        value = "未配置"

    duration = entry.get("duration_seconds")
    if duration is not None:
        value = f"{value}，持续约 {duration}s"
    return value


def _join_value_unit(value: Any, unit: str) -> str:
    if not unit:
        return str(value)
    if unit == "%":
        return f"{value}{unit}"
    return f"{value} {unit}"


def _confirmation_text(entry: dict[str, Any]) -> str:
    if entry.get("requires_site_confirmation"):
        return "需现场确认"
    return "可按配置口径引用"


load_process_baseline()

__all__ = ["PROCESS_BASELINE", "PROCESS_BASELINE_PATH", "format_process_baseline", "load_process_baseline"]
