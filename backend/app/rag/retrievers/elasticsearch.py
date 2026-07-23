from __future__ import annotations

from ..elasticsearch_store import ConfiguredElasticsearchChunkStore, ElasticsearchChunkStore
from ..schemas import RetrievalRequest, RetrievalResult


class ElasticsearchRetriever:
    """BM25 retriever backed by Elasticsearch."""

    def __init__(self, store: ElasticsearchChunkStore | None = None, *, candidate_k: int | None = None) -> None:
        self.store = store or ConfiguredElasticsearchChunkStore()
        self.candidate_k = candidate_k

    def retrieve(self, request: RetrievalRequest) -> list[RetrievalResult]:
        return self.store.search(request, candidate_k=self.candidate_k)
