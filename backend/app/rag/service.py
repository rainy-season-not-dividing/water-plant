import os

from .retriever import RagRetriever
from .schemas import RetrievalRequest, RetrievalResult


class RagService:
    """Stable facade for Agents, workflows, and tools."""

    def __init__(self, retriever: RagRetriever | None = None) -> None:
        self.retriever = retriever or RagRetriever()

    @property
    def enabled(self) -> bool:
        return os.getenv("RAG_ENABLED", "false").strip().lower() == "true"

    def retrieve(self, request: RetrievalRequest) -> list[RetrievalResult]:
        if not self.enabled:
            return []
        return self.retriever.retrieve(request)


rag_service = RagService()
