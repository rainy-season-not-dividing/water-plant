from __future__ import annotations

from ..retriever import RagRetriever
from ..schemas import RetrievalRequest, RetrievalResult


class VectorRetriever:
    """Named wrapper around the existing Qdrant vector retriever."""

    def __init__(self, retriever: RagRetriever | None = None) -> None:
        self.retriever = retriever or RagRetriever()

    def retrieve(self, request: RetrievalRequest) -> list[RetrievalResult]:
        return self.retriever.retrieve(request)
