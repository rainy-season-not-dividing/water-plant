from collections.abc import Sequence

from .chunker import SimpleTextChunker
from .interfaces import Chunker, EmbeddingProvider, VectorStore
from .schemas import KnowledgeChunk


class KnowledgeIngestionPipeline:
    """Coordinates chunking, embedding, and vector-store writes."""

    def __init__(
        self,
        *,
        chunker: Chunker | None = None,
        embedding_provider: EmbeddingProvider | None = None,
        vector_store: VectorStore | None = None,
    ) -> None:
        self.chunker = chunker or SimpleTextChunker()
        self.embedding_provider = embedding_provider
        self.vector_store = vector_store

    def ingest_text(self, text: str, *, source: str) -> Sequence[KnowledgeChunk]:
        chunks = list(self.chunker.split_text(text, source=source))
        if not chunks:
            return []
        if self.embedding_provider is None or self.vector_store is None:
            raise NotImplementedError("RAG ingestion storage is not wired yet.")

        vectors = self.embedding_provider.embed_texts([chunk.text for chunk in chunks])
        self.vector_store.upsert_chunks(chunks, vectors)
        return chunks
