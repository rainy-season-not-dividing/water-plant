from copy import deepcopy
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/admin", tags=["admin"])


class MetricField(BaseModel):
    key: str
    label: str
    value: float | int | str
    unit: str = ""
    normalRange: dict | list[str] | None = None
    alarmRule: str | None = None
    shiftDirection: str | None = None


class AdminAgentConfig(BaseModel):
    id: str
    name: str
    englishName: str
    color: str
    role: str
    capabilities: list[str] = Field(default_factory=list)
    metrics: list[MetricField] = Field(default_factory=list)
    enabled: bool = True


class AdminAgentUpdate(BaseModel):
    name: str | None = None
    englishName: str | None = None
    color: str | None = None
    role: str | None = None
    capabilities: list[str] | None = None
    metrics: list[MetricField] | None = None
    enabled: bool | None = None


class AdminPlanAction(BaseModel):
    id: str
    label: str
    defaultParameter: str = ""
    defaultBasis: str = ""
    agentIds: list[str] = Field(default_factory=list)
    incidentTypes: list[str] = Field(default_factory=list)
    enabled: bool = True


class AdminPlanActionCreate(BaseModel):
    label: str
    defaultParameter: str = ""
    defaultBasis: str = ""
    agentIds: list[str] = Field(default_factory=list)
    incidentTypes: list[str] = Field(default_factory=list)
    enabled: bool = True


class AdminPlanActionUpdate(BaseModel):
    label: str | None = None
    defaultParameter: str | None = None
    defaultBasis: str | None = None
    agentIds: list[str] | None = None
    incidentTypes: list[str] | None = None
    enabled: bool | None = None


AGENTS: list[dict] = [
    {
        "id": "supervisor",
        "name": "监管总管智能体",
        "englishName": "Supervisor",
        "color": "#378ADD",
        "role": "汇总 UF、RO、加药和泵组状态，生成风险分级与人工确认单，不直接控制设备。",
        "capabilities": ["风险汇总", "冲突消解", "人工确认单", "闭环复盘"],
        "metrics": [
            {"key": "alarmCount", "label": "待确认建议", "value": 0, "unit": "条", "normalRange": {"min": 0, "max": 5}, "alarmRule": "upper", "shiftDirection": "up"},
            {"key": "productionScale", "label": "产水规模", "value": 3000, "unit": "m3/d", "normalRange": {"min": 2800, "max": 3000}, "alarmRule": "lower", "shiftDirection": "down"},
            {"key": "feedScale", "label": "进水规模", "value": 4300, "unit": "m3/d", "normalRange": {"min": 4000, "max": 4500}, "alarmRule": "both"},
            {"key": "onlineRate", "label": "设备在线率", "value": 100, "unit": "%", "normalRange": {"min": 95}, "alarmRule": "lower", "shiftDirection": "down"},
        ],
        "enabled": True,
    },
    {
        "id": "dosing",
        "name": "加药智能体",
        "englishName": "Dosing",
        "color": "#BA7517",
        "role": "跟踪 RO 阻垢剂、UF 清洗药剂、加药泵流量和药箱液位，输出投加/清洗建议并等待人工确认。",
        "capabilities": ["阻垢剂核查", "UF 清洗药剂复核", "加药泵偏差识别", "药箱液位跟踪"],
        "metrics": [
            {"key": "antiscalantDose", "label": "阻垢剂投加", "value": 4.0, "unit": "ppm", "normalRange": {"min": 3, "max": 5}, "alarmRule": "both", "shiftDirection": "up"},
            {"key": "chemicalLevel", "label": "药箱液位", "value": 72, "unit": "%", "normalRange": {"min": 20, "max": 100}, "alarmRule": "lower", "shiftDirection": "down"},
            {"key": "pumpDeviation", "label": "加药泵偏差", "value": 4, "unit": "%", "normalRange": {"max": 10}, "alarmRule": "upper", "shiftDirection": "up"},
            {"key": "ufCleanState", "label": "UF清洗药剂", "value": "待命", "unit": "", "normalRange": ["待命", "需复核"], "alarmRule": None},
        ],
        "enabled": True,
    },
    {
        "id": "uf",
        "name": "超滤智能体",
        "englishName": "UF",
        "color": "#1D9E75",
        "role": "监测 UF TMP、产水浊度、SDI、回收率和反洗/CEB 记录，判断是否生成反洗或 CEB 建议。",
        "capabilities": ["TMP 趋势识别", "反洗恢复评估", "CEB/CED 条件复核", "RO 前置保护"],
        "metrics": [
            {"key": "tmp", "label": "UF TMP", "value": 82, "unit": "kPa", "normalRange": {"max": 300}, "alarmRule": "upper", "shiftDirection": "up"},
            {"key": "recovery", "label": "UF回收率", "value": 93, "unit": "%", "normalRange": {"min": 90, "max": 93}, "alarmRule": "lower", "shiftDirection": "down"},
            {"key": "turbidity", "label": "UF产水浊度", "value": 0.8, "unit": "NTU", "normalRange": {"max": 1}, "alarmRule": "upper", "shiftDirection": "up"},
            {"key": "sdi", "label": "UF出水SDI", "value": 2.5, "unit": "", "normalRange": {"max": 3}, "alarmRule": "upper", "shiftDirection": "up"},
        ],
        "enabled": True,
    },
    {
        "id": "ro",
        "name": "反渗透智能体",
        "englishName": "RO",
        "color": "#D85A30",
        "role": "分析一级 RO 进水压力、段间压差、产水 TDS、回收率和 CIP 风险，输出膜保护建议。",
        "capabilities": ["TDS 异常识别", "段间压差分析", "回收率复核", "CIP 风险评估"],
        "metrics": [
            {"key": "inletPressure", "label": "RO进水压力", "value": 1.2, "unit": "MPa", "normalRange": {"min": 1.0, "max": 1.5}, "alarmRule": "both", "shiftDirection": "up"},
            {"key": "tds", "label": "产水TDS", "value": 180, "unit": "mg/L", "normalRange": {"min": 100, "max": 300}, "alarmRule": "upper", "shiftDirection": "up"},
            {"key": "recovery", "label": "RO回收率", "value": 75, "unit": "%", "normalRange": {"min": 70, "max": 75}, "alarmRule": "lower", "shiftDirection": "down"},
            {"key": "desalination", "label": "脱盐率", "value": 97, "unit": "%", "normalRange": {"min": 95, "max": 99}, "alarmRule": "lower", "shiftDirection": "down"},
        ],
        "enabled": True,
    },
    {
        "id": "pump",
        "name": "泵组智能体",
        "englishName": "Pump",
        "color": "#534AB7",
        "role": "持续评估泵组转速、电流、温度、压力和能耗，给出供水能力与备用泵切换建议。",
        "capabilities": ["负载识别", "温升复核", "备用泵分担", "供水能力校核"],
        "metrics": [
            {"key": "speed", "label": "转速", "value": 1480, "unit": "rpm", "normalRange": {"min": 1450, "max": 1500}, "alarmRule": "both", "shiftDirection": "up"},
            {"key": "current", "label": "电流", "value": 28, "unit": "A", "normalRange": {"min": 25, "max": 35}, "alarmRule": "upper", "shiftDirection": "up"},
            {"key": "temperature", "label": "温度", "value": 55, "unit": "degC", "normalRange": {"max": 65}, "alarmRule": "upper", "shiftDirection": "up"},
            {"key": "runState", "label": "运行状态", "value": "正常", "unit": "", "normalRange": ["正常", "过载"], "alarmRule": None},
        ],
        "enabled": True,
    },
]

PLAN_ACTIONS: list[dict] = [
    {"id": "review-uf-upstream-protection", "label": "复核 UF 上游保护状态", "defaultParameter": "自清洗过滤器压差、进水浊度、UF 产水浊度", "defaultBasis": "UF 是 RO 前置保护，先排查上游颗粒负荷和过滤器状态。", "agentIds": ["uf"], "incidentTypes": ["uf_clogging", "ro_fouling"], "enabled": True},
    {"id": "evaluate-backwash-recovery", "label": "评估物理反洗恢复效果", "defaultParameter": "UF TMP、反洗周期、反洗后恢复率", "defaultBasis": "TMP 持续升高或反洗恢复不足时，再升级到 CEB/CED 评估。", "agentIds": ["uf"], "incidentTypes": ["uf_clogging"], "enabled": True},
    {"id": "review-ro-feed-protection", "label": "确认 RO 进水保护", "defaultParameter": "UF 产水浊度、SDI、余氯/ORP 残留", "defaultBasis": "UF 清洗恢复不等于 RO 可立即进水，需确认残留风险。", "agentIds": ["ro", "uf"], "incidentTypes": ["uf_clogging", "ro_fouling", "dosing_abnormal"], "enabled": True},
    {"id": "review-antiscalant-dosing", "label": "核查阻垢剂投加状态", "defaultParameter": "阻垢剂投加量、药箱液位、加药泵流量", "defaultBasis": "结垢风险需结合 TDS、回收率、段间压差和投加状态判断。", "agentIds": ["dosing", "ro"], "incidentTypes": ["dosing_abnormal", "ro_fouling"], "enabled": True},
    {"id": "evaluate-ro-cip-condition", "label": "评估 RO CIP 条件", "defaultParameter": "污染类型、清洗剂兼容性、CIP 周期、清洗循环能力", "defaultBasis": "CIP 只作为恢复不足后的建议，避免过度清洗伤膜。", "agentIds": ["ro"], "incidentTypes": ["ro_fouling"], "enabled": True},
    {"id": "review-pump-load-temperature", "label": "复核泵组负载与温升", "defaultParameter": "主泵电流、温度、压力、流量", "defaultBasis": "判断是否存在持续过载、轴温异常或供水波动。", "agentIds": ["pump"], "incidentTypes": ["pump_overload"], "enabled": True},
    {"id": "evaluate-standby-pump-sharing", "label": "评估降载和备用泵分担", "defaultParameter": "主泵转速、备用泵状态、分担比例", "defaultBasis": "泵组调整会影响 UF/RO 进水压力和产水量，必须人工确认。", "agentIds": ["pump"], "incidentTypes": ["pump_overload"], "enabled": True},
    {"id": "record-manual-boundary", "label": "记录人工确认和处置边界", "defaultParameter": "仅记录建议，不自动下发 PLC/泵阀/反洗/CEB/CIP", "defaultBasis": "当前系统权限策略要求所有控制动作由人工确认后执行。", "agentIds": ["supervisor", "dosing", "uf", "ro", "pump"], "incidentTypes": ["dosing_abnormal", "uf_clogging", "ro_fouling", "pump_overload"], "enabled": True},
    {"id": "writeback-effect-observation", "label": "效果回写与持续观察", "defaultParameter": "产水量、健康度、关键指标变化", "defaultBasis": "记录确认后指标变化，作为后续建议单闭环依据。", "agentIds": ["supervisor", "dosing", "uf", "ro", "pump"], "incidentTypes": ["dosing_abnormal", "uf_clogging", "ro_fouling", "pump_overload"], "enabled": True},
]


@router.get("/agents", response_model=list[AdminAgentConfig])
def list_agents():
    return deepcopy(AGENTS)


@router.put("/agents/{agent_id}", response_model=AdminAgentConfig)
def update_agent(agent_id: str, patch: AdminAgentUpdate):
    for index, item in enumerate(AGENTS):
        if item["id"] != agent_id:
            continue
        update = patch.model_dump(exclude_unset=True)
        AGENTS[index] = {**item, **update, "id": agent_id}
        return deepcopy(AGENTS[index])
    raise HTTPException(status_code=404, detail="Agent not found")


@router.get("/plan-actions", response_model=list[AdminPlanAction])
def list_plan_actions():
    return deepcopy(PLAN_ACTIONS)


@router.post("/plan-actions", response_model=AdminPlanAction, status_code=201)
def create_plan_action(payload: AdminPlanActionCreate):
    item = payload.model_dump()
    item["id"] = f"plan-action-{uuid4().hex[:8]}"
    PLAN_ACTIONS.insert(0, item)
    return deepcopy(item)


@router.put("/plan-actions/{action_id}", response_model=AdminPlanAction)
def update_plan_action(action_id: str, patch: AdminPlanActionUpdate):
    for index, item in enumerate(PLAN_ACTIONS):
        if item["id"] != action_id:
            continue
        update = patch.model_dump(exclude_unset=True)
        PLAN_ACTIONS[index] = {**item, **update, "id": action_id}
        return deepcopy(PLAN_ACTIONS[index])
    raise HTTPException(status_code=404, detail="Plan action not found")


@router.delete("/plan-actions/{action_id}")
def delete_plan_action(action_id: str):
    for index, item in enumerate(PLAN_ACTIONS):
        if item["id"] == action_id:
            del PLAN_ACTIONS[index]
            return {"ok": True}
    raise HTTPException(status_code=404, detail="Plan action not found")
