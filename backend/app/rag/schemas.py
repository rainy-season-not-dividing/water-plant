from dataclasses import dataclass, field
from typing import Any, Literal


KnowledgeType = Literal[
    "process_doc",
    "equipment_manual",
    "operation_case",
    "runtime_log",
    "safety_rule",
    "human_confirmation",
    "plan_rationale",
]


@dataclass(slots=True)
class KnowledgeMetadata:
    """Metadata used for Agent-scoped filtering before and after vector search."""

    source: str
    knowledge_type: KnowledgeType
    agent_scope: list[str] = field(default_factory=list)
    process_area: str | None = None
    device_id: str | None = None
    incident_type: str | None = None
    source_version: str | None = None
    safety_level: str | None = None
    effective_time: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class KnowledgeChunk:
    id: str
    text: str
    metadata: KnowledgeMetadata


@dataclass(slots=True)
class RetrievalRequest:
    query: str
    agent_id: str | None = None
    top_k: int = 5
    process_area: str | None = None
    device_id: str | None = None
    incident_type: str | None = None
    knowledge_types: list[KnowledgeType] = field(default_factory=list)


@dataclass(slots=True)
class RetrievalResult:
    chunk: KnowledgeChunk
    score: float
    rank: int
