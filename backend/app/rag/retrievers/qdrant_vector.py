from __future__ import annotations

from ..interfaces import EmbeddingProvider, VectorStore
from ..schemas import RetrievalRequest, RetrievalResult


class QdrantVectorRetriever:
    """Embedding + Qdrant vector retrieval boundary."""

    def __init__(
        self,
        *,
        embedding_provider: EmbeddingProvider | None = None,
        vector_store: VectorStore | None = None,
        auto_configure: bool = True,
    ) -> None:
        self.embedding_provider = embedding_provider
        self.vector_store = vector_store
        self.auto_configure = auto_configure

    def retrieve(self, request: RetrievalRequest) -> list[RetrievalResult]:
        embedding_provider = self._embedding_provider()
        vector_store = self._vector_store()
        if embedding_provider is None or vector_store is None:
            return []

        query_vector = embedding_provider.embed_text(request.query)
        return vector_store.search(request, query_vector)

    def _embedding_provider(self) -> EmbeddingProvider | None:
        if self.embedding_provider is None and self.auto_configure:
            from ..embeddings import ConfiguredEmbeddingProvider

            self.embedding_provider = ConfiguredEmbeddingProvider()
        return self.embedding_provider

    def _vector_store(self) -> VectorStore | None:
        if self.vector_store is None and self.auto_configure:
            from ..qdrant_store import ConfiguredQdrantVectorStore

            self.vector_store = ConfiguredQdrantVectorStore()
        return self.vector_store
