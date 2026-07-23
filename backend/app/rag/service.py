import os
from pathlib import Path

from .retriever import RagRetriever
from .schemas import RetrievalRequest, RetrievalResult


class RagService:
    """Stable facade for Agents, workflows, and tools."""

    def __init__(self, retriever: RagRetriever | None = None) -> None:
        self.retriever = retriever or RagRetriever()

    @property
    def enabled(self) -> bool:
        return os.getenv("RAG_ENABLED", "false").strip().lower() == "true"

    @property
    def mode(self) -> str:
        return os.getenv("RAG_RETRIEVAL_MODE", "hybrid").strip().lower()

    def retrieve(self, request: RetrievalRequest) -> list[RetrievalResult]:
        if not self.enabled:
            return []
        if self.mode == "keyword":
            return self._retrieve_keyword(request)
        if self.mode == "vector":
            return self._retrieve_vector(request)
        return self._retrieve_hybrid(request)

    def _retrieve_keyword(self, request: RetrievalRequest) -> list[RetrievalResult]:
        try:
            return self._keyword_retriever().retrieve(request)
        except Exception:
            return []

    def _retrieve_vector(self, request: RetrievalRequest) -> list[RetrievalResult]:
        try:
            return self.retriever.retrieve(request)
        except Exception:
            return []

    def _retrieve_hybrid(self, request: RetrievalRequest) -> list[RetrievalResult]:
        try:
            keyword_retriever = self._keyword_retriever()
        except Exception:
            return self._retrieve_vector(request)

        try:
            from .retrievers.hybrid import HybridRetriever
            from .retrievers.vector import VectorRetriever

            return HybridRetriever(
                keyword_retriever=keyword_retriever,
                vector_retriever=VectorRetriever(self.retriever),
                rrf_k=_env_int("RAG_RRF_K", 60),
                bm25_weight=_env_float("RAG_BM25_WEIGHT", 1.0),
                vector_weight=_env_float("RAG_VECTOR_WEIGHT", 1.0),
                candidate_k=_env_int("RAG_HYBRID_CANDIDATE_K", 80),
                fusion_keep=_env_int("RAG_FUSION_KEEP", 50),
                doc_chunk_limit=_env_int("RAG_DOC_CHUNK_LIMIT", 3),
            ).retrieve(request)
        except Exception:
            return keyword_retriever.retrieve(request)

    def _keyword_retriever(self):
        if os.getenv("RAG_LEGACY_WIKI_KEYWORD", "false").strip().lower() == "true":
            return _legacy_wiki_keyword_retriever()
        from .retrievers.elasticsearch import ElasticsearchRetriever

        return ElasticsearchRetriever()


def _legacy_wiki_keyword_retriever():
    from .retrievers.keyword import KeywordRetriever
    from .sources.wiki.config import WikiSourceConfig
    from .sources.wiki.extractor import WikiMarkdownExtractor

    payload = WikiMarkdownExtractor(config=WikiSourceConfig.from_path(_wikidb_root())).approved_payload()
    return KeywordRetriever.from_approved_payload(payload)


def _wikidb_root() -> Path:
    configured = os.getenv("RAG_WIKIDB_ROOT", "").strip()
    if configured:
        return Path(configured)
    project_root = Path(__file__).resolve().parents[3]
    return project_root.parent / "wikidb" / "wikidb"


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
