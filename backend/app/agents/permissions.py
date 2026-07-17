from .schemas import AgentId

DEFAULT_TOOL_ALLOWLIST: dict[AgentId, tuple[str, ...]] = {
    "supervisor": ("read_telemetry", "read_history", "safety_review"),
    "dosing": ("read_telemetry", "read_history"),
    "uf": ("read_telemetry", "read_history"),
    "ro": ("read_telemetry", "read_history"),
    "pump": ("read_telemetry", "read_history"),
}


def get_tool_allowlist(agent_id: AgentId) -> tuple[str, ...]:
    return DEFAULT_TOOL_ALLOWLIST[agent_id]
