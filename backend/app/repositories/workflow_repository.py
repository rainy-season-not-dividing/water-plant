from copy import deepcopy
from typing import Any


class WorkflowRepository:
    def __init__(self) -> None:
        self._runs: dict[str, dict[str, Any]] = {}

    def save(self, run: dict[str, Any]) -> dict[str, Any]:
        self._runs[run["id"]] = run
        return deepcopy(run)


workflow_repository = WorkflowRepository()
