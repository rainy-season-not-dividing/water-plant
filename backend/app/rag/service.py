import os

from .retrievers.elasticsearch import ElasticsearchRetriever
from .retrievers.hybrid import HybridRetriever
from .retrievers.qdrant_vector import QdrantVectorRetriever
from .schemas import RetrievalRequest, RetrievalResponse, RetrievalResult, RetrievalStatus


class RagService:
    """Stable facade for Agents, workflows, and tools."""

    def __init__(
        self,
        *,
        bm25_retriever: object | None = None,
        vector_retriever: object | None = None,
    ) -> None:
        self.bm25_retriever = bm25_retriever
        self.vector_retriever = vector_retriever

    @property
    def enabled(self) -> bool:
        return os.getenv("RAG_ENABLED", "false").strip().lower() == "true"

    @property
    def mode(self) -> str:
        return os.getenv("RAG_RETRIEVAL_MODE", "hybrid").strip().lower()

    def retrieve(self, request: RetrievalRequest) -> RetrievalResponse:
        if not self.enabled:
            return RetrievalResponse(status="disabled", metadata={"mode": self.mode})

        mode = self.mode
        if mode in {"bm25", "keyword"}:
            return self._retrieve_single_source(
                source="bm25",
                retriever=self._bm25_retriever(),
                request=request,
                success_status="degraded_bm25_only",
            )
        if mode == "vector":
            return self._retrieve_single_source(
                source="vector",
                retriever=self._vector_retriever(),
                request=request,
                success_status="degraded_vector_only",
            )
        return self._retrieve_hybrid(request)

    def _retrieve_hybrid(self, request: RetrievalRequest) -> RetrievalResponse:
        return HybridRetriever(
            bm25_retriever=self._bm25_retriever(),
            vector_retriever=self._vector_retriever(),
            rrf_k=_env_int("RAG_RRF_K", 60),
            bm25_weight=_env_float("RAG_BM25_WEIGHT", 1.0),
            vector_weight=_env_float("RAG_VECTOR_WEIGHT", 1.0),
            candidate_k=_env_int("RAG_HYBRID_CANDIDATE_K", 80),
            fusion_keep=_env_int("RAG_FUSION_KEEP", 50),
            doc_chunk_limit=_env_int("RAG_DOC_CHUNK_LIMIT", 3),
        ).retrieve(request)

    def _retrieve_single_source(
        self,
        *,
        source: str,
        retriever: object,
        request: RetrievalRequest,
        success_status: RetrievalStatus,
    ) -> RetrievalResponse:
        try:
            results = retriever.retrieve(request)
        except Exception as exc:
            return RetrievalResponse(
                status="failed",
                failed_sources=[source],
                errors={source: f"{type(exc).__name__}: {exc}"},
                source_counts={source: 0},
                metadata={"mode": self.mode},
            )
        if not isinstance(results, list):
            return RetrievalResponse(
                status="failed",
                failed_sources=[source],
                errors={source: "retriever_returned_non_list"},
                source_counts={source: 0},
                metadata={"mode": self.mode},
            )
        status: RetrievalStatus = success_status if results else "no_results"
        return RetrievalResponse(
            status=status,
            results=results,
            source_counts={source: len(results)},
            metadata={"mode": self.mode},
        )

    def _bm25_retriever(self) -> object:
        if self.bm25_retriever is None:
            self.bm25_retriever = ElasticsearchRetriever()
        return self.bm25_retriever

    def _vector_retriever(self) -> object:
        if self.vector_retriever is None:
            self.vector_retriever = QdrantVectorRetriever()
        return self.vector_retriever


def retrieval_results(response: RetrievalResponse | list[RetrievalResult]) -> list[RetrievalResult]:
    if isinstance(response, RetrievalResponse):
        return response.results
    return response


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name, "").strip()
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name, "").strip()
    if not value:
        return default
    try:
        return float(value)
    except ValueError:
        return default


rag_service = RagService()
