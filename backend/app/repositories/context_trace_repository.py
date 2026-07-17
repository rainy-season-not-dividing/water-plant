from copy import deepcopy
from typing import Any


class ContextTraceRepository:
    def __init__(self) -> None:
        self._traces: list[dict[str, Any]] = []

    def append(self, trace: dict[str, Any]) -> dict[str, Any]:
        self._traces.append(trace)
        return deepcopy(trace)


context_trace_repository = ContextTraceRepository()
