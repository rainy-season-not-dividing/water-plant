from .base import RuntimeAgent
from .schemas import AgentDefinition, AgentId, IncidentType, LegacyAnalysisPhase
from .supervisor.prompts import SYSTEM_PROMPT as SUPERVISOR_SYSTEM_PROMPT
from .dosing.prompts import SYSTEM_PROMPT as DOSING_SYSTEM_PROMPT
from .uf.prompts import SYSTEM_PROMPT as UF_SYSTEM_PROMPT
from .ro.prompts import SYSTEM_PROMPT as RO_SYSTEM_PROMPT
from .pump.prompts import SYSTEM_PROMPT as PUMP_SYSTEM_PROMPT

_INCIDENT_TARGET_AGENT: dict[IncidentType, AgentId] = {
    "dosing_abnormal": "dosing",
    "uf_clogging": "uf",
    "ro_fouling": "ro",
    "pump_overload": "pump",
}

_AGENT_DEFINITIONS: dict[AgentId, AgentDefinition] = {
    "supervisor": AgentDefinition(
        id="supervisor",
        name="监管总管智能体",
        role="supervisor",
        description="主控调度、任务拆解、结果汇总、冲突识别和人工确认建议单组织。",
    ),
    "dosing": AgentDefinition(
        id="dosing",
        name="加药智能体",
        role="specialist",
        description="负责 UF 清洗加药域、RO 保护加药域和加药泵偏差分析。",
        private_skill_namespace="agents.dosing.skills",
    ),
    "uf": AgentDefinition(
        id="uf",
        name="超滤智能体",
        role="specialist",
        description="负责 UF TMP、浊度、SDI、反洗、CEB/CED 和 RO 前置保护分析。",
        private_skill_namespace="agents.uf.skills",
    ),
    "ro": AgentDefinition(
        id="ro",
        name="反渗透智能体",
        role="specialist",
        description="负责 RO TDS、段间压差、回收率、泵压影响和 CIP 风险评估。",
        private_skill_namespace="agents.ro.skills",
    ),
    "pump": AgentDefinition(
        id="pump",
        name="泵组智能体",
        role="specialist",
        description="负责泵组负载、温升、压力/流量支撑和备用泵分担评估。",
        private_skill_namespace="agents.pump.skills",
    ),
}

_SYSTEM_PROMPTS = {
    "supervisor": SUPERVISOR_SYSTEM_PROMPT,
    "dosing": DOSING_SYSTEM_PROMPT,
    "uf": UF_SYSTEM_PROMPT,
    "ro": RO_SYSTEM_PROMPT,
    "pump": PUMP_SYSTEM_PROMPT,
}


def get_agent(agent_id: AgentId) -> RuntimeAgent:
    return RuntimeAgent(
        definition=_AGENT_DEFINITIONS[agent_id],
        system_prompt=_SYSTEM_PROMPTS[agent_id],
    )


def get_specialist_agent_for_incident(incident_type: IncidentType) -> RuntimeAgent:
    return get_agent(_INCIDENT_TARGET_AGENT[incident_type])


def get_legacy_phase_agent(phase: LegacyAnalysisPhase, incident_type: IncidentType) -> RuntimeAgent:
    if phase == "supervisor" or phase == "sandbox":
        return get_agent("supervisor")
    return get_specialist_agent_for_incident(incident_type)
