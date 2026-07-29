from __future__ import annotations

from collections.abc import Sequence
import unittest

from app.rag.retrievers.qdrant_vector import QdrantVectorRetriever
from app.rag.schemas import KnowledgeChunk, KnowledgeMetadata, RetrievalRequest, RetrievalResult


class QdrantVectorRetrieverTest(unittest.TestCase):
    def test_retrieve_embeds_query_and_searches_vector_store(self) -> None:
        embedding_provider = _FakeEmbeddingProvider(vector=[0.1, 0.2, 0.3])
        vector_store = _FakeVectorStore()
        retriever = QdrantVectorRetriever(
            embedding_provider=embedding_provider,
            vector_store=vector_store,
            auto_configure=False,
        )
        request = RetrievalRequest(query="energy saving", top_k=3)

        results = retriever.retrieve(request)

        self.assertEqual(embedding_provider.embedded_texts, ["energy saving"])
        self.assertEqual(vector_store.last_request, request)
        self.assertEqual(vector_store.last_query_vector, [0.1, 0.2, 0.3])
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].chunk.text, "Use renewable energy first.")

    def test_retrieve_returns_empty_when_not_configured_and_auto_configure_disabled(self) -> None:
        retriever = QdrantVectorRetriever(auto_configure=False)

        self.assertEqual(retriever.retrieve(RetrievalRequest(query="hello")), [])


class _FakeEmbeddingProvider:
    def __init__(self, *, vector: list[float]) -> None:
        self.vector = vector
        self.embedded_texts: list[str] = []

    def embed_text(self, text: str) -> list[float]:
        self.embedded_texts.append(text)
        return self.vector

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        return [self.embed_text(text) for text in texts]


class _FakeVectorStore:
    def __init__(self) -> None:
        self.last_request: RetrievalRequest | None = None
        self.last_query_vector: list[float] | None = None

    def upsert_chunks(self, chunks: Sequence[KnowledgeChunk], vectors: Sequence[list[float]]) -> None:
        return None

    def search(self, request: RetrievalRequest, query_vector: list[float]) -> list[RetrievalResult]:
        self.last_request = request
        self.last_query_vector = query_vector
        return [
            RetrievalResult(
                chunk=KnowledgeChunk(
                    id="chunk-1",
                    text="Use renewable energy first.",
                    metadata=KnowledgeMetadata(source="standard.docx", knowledge_type="process_doc"),
                ),
                score=0.9,
                rank=1,
            )
        ]


if __name__ == "__main__":
    unittest.main()
