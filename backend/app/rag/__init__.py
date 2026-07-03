"""RAG foundation for knowledge ingestion and retrieval."""

from .schemas import (
    KnowledgeChunk,
    KnowledgeMetadata,
    RetrievalRequest,
    RetrievalResult,
)
from .service import RagService, rag_service

__all__ = [
    "KnowledgeChunk",
    "KnowledgeMetadata",
    "RetrievalRequest",
    "RetrievalResult",
    "RagService",
    "rag_service",
]
