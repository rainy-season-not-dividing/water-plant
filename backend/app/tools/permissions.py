from ..agents.permissions import get_tool_allowlist
from ..agents.schemas import AgentId


def can_agent_use_tool(agent_id: AgentId, tool_name: str) -> bool:
    return tool_name in get_tool_allowlist(agent_id)
