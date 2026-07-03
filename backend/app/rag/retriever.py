from .interfaces import EmbeddingProvider, VectorStore
from .schemas import RetrievalRequest, RetrievalResult


class RagRetriever:
    """Retrieval boundary used by tools and Agent workflows."""

    def __init__(
        self,
        *,
        embedding_provider: EmbeddingProvider | None = None,
        vector_store: VectorStore | None = None,
    ) -> None:
        self.embedding_provider = embedding_provider
        self.vector_store = vector_store

    def retrieve(self, request: RetrievalRequest) -> list[RetrievalResult]:
        if self.embedding_provider is None or self.vector_store is None:
            return []

        query_vector = self.embedding_provider.embed_text(request.query)
        return self.vector_store.search(request, query_vector)
