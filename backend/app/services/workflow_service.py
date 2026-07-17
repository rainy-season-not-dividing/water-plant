from typing import Any

from ..repositories.workflow_repository import workflow_repository


def save_workflow_run(run: dict[str, Any]) -> dict[str, Any]:
    return workflow_repository.save(run)
