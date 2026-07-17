from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator


class Workflow(ABC):
    @abstractmethod
    async def stream(self) -> AsyncGenerator[str, None]:
        raise NotImplementedError
