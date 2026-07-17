from dataclasses import dataclass

from .schemas import AgentDefinition


@dataclass(frozen=True)
class RuntimeAgent:
    definition: AgentDefinition
    system_prompt: str

    @property
    def id(self) -> str:
        return self.definition.id
