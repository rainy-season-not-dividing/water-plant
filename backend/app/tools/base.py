from abc import ABC, abstractmethod
from typing import Any


class AgentTool(ABC):
    name: str

    @abstractmethod
    def call(self, **kwargs: Any) -> Any:
        raise NotImplementedError
