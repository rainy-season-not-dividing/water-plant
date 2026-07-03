from collections.abc import Iterable, Sequence
from typing import Protocol

from .schemas import KnowledgeChunk, RetrievalRequest, RetrievalResult


class EmbeddingProvider(Protocol):
    def embed_text(self, text: str) -> list[float]:
        ...

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        ...


class VectorStore(Protocol):
    def upsert_chunks(self, chunks: Sequence[KnowledgeChunk], vectors: Sequence[list[float]]) -> None:
        ...

    def search(self, request: RetrievalRequest, query_vector: list[float]) -> list[RetrievalResult]:
        ...


class Chunker(Protocol):
    def split_text(self, text: str, *, source: str) -> Iterable[KnowledgeChunk]:
        ...
