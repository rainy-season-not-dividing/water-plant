from typing import Any

from ..repositories.agent_run_repository import agent_run_repository


def create_agent_run(*, goal: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    return agent_run_repository.create(goal=goal, context=context)
