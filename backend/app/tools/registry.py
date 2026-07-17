from .base import AgentTool

_TOOLS: dict[str, AgentTool] = {}


def register_tool(tool: AgentTool) -> AgentTool:
    _TOOLS[tool.name] = tool
    return tool


def get_tool(name: str) -> AgentTool | None:
    return _TOOLS.get(name)


def list_tools() -> tuple[str, ...]:
    return tuple(_TOOLS)
