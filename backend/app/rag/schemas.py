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

ReviewStatus = Literal["pending_review", "approved", "rejected"]

RetrievalStatus = Literal[
    "disabled",
    "hybrid",
    "degraded_bm25_only",
    "degraded_vector_only",
    "no_results",
    "failed",
]


@dataclass(slots=True)
class KnowledgeMetadata:
    """Metadata used for Agent-scoped filtering before and after vector search."""

    source: str
    knowledge_type: KnowledgeType
    agent_scope: list[str] = field(default_factory=list)
    process_areas: list[str] = field(default_factory=list)
    device_ids: list[str] = field(default_factory=list)
    incident_types: list[str] = field(default_factory=list)
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
class PendingReviewKnowledgeBlock:
    """Cleaned knowledge candidate that must be approved before vector ingestion."""

    id: str
    text: str
    metadata: KnowledgeMetadata
    status: ReviewStatus = "pending_review"
    title: str | None = None
    section_path: list[str] = field(default_factory=list)
    source_locator: str | None = None
    char_count: int = 0


@dataclass(slots=True)
class RetrievalRequest:
    query: str
    agent_id: str | None = None
    top_k: int = 5
    tenant_id: str | None = None
    roles: list[str] = field(default_factory=list)
    process_areas: list[str] = field(default_factory=list)
    device_ids: list[str] = field(default_factory=list)
    incident_types: list[str] = field(default_factory=list)
    knowledge_types: list[KnowledgeType] = field(default_factory=list)


@dataclass(slots=True)
class RetrievalResult:
    chunk: KnowledgeChunk
    score: float
    rank: int


@dataclass(slots=True)
class RetrievalResponse:
    status: RetrievalStatus
    results: list[RetrievalResult] = field(default_factory=list)
    failed_sources: list[str] = field(default_factory=list)
    errors: dict[str, str] = field(default_factory=dict)
    source_counts: dict[str, int] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def failed(self) -> bool:
        return self.status == "failed"
