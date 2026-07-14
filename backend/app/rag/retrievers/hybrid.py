from __future__ import annotations

from dataclasses import replace

from ..schemas import RetrievalRequest, RetrievalResult


class HybridRetriever:
    """Fuse keyword and vector retrieval with reciprocal rank fusion."""

    def __init__(
        self,
        *,
        keyword_retriever: object,
        vector_retriever: object,
        rrf_k: int = 60,
    ) -> None:
        self.keyword_retriever = keyword_retriever
        self.vector_retriever = vector_retriever
        self.rrf_k = rrf_k

    def retrieve(self, request: RetrievalRequest) -> list[RetrievalResult]:
        expanded = replace(request, top_k=max(request.top_k * 2, request.top_k))
        keyword_results = self.keyword_retriever.retrieve(expanded)
        vector_results = self.vector_retriever.retrieve(expanded)
        return fuse_results(
            keyword_results=keyword_results,
            vector_results=vector_results,
            top_k=request.top_k,
            rrf_k=self.rrf_k,
            include_navigation=_is_navigation_query(request.query),
        )


def fuse_results(
    *,
    keyword_results: list[RetrievalResult],
    vector_results: list[RetrievalResult],
    top_k: int,
    rrf_k: int = 60,
    include_navigation: bool = False,
) -> list[RetrievalResult]:
    by_id: dict[str, RetrievalResult] = {}
    scores: dict[str, float] = {}
    sources: dict[str, list[str]] = {}

    for source_name, results in (("keyword", keyword_results), ("vector", vector_results)):
        for result in results:
            chunk_id = result.chunk.id
            if _is_navigation_result(result) and not include_navigation:
                continue
            by_id.setdefault(chunk_id, result)
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (rrf_k + result.rank)
            if include_navigation and _is_navigation_result(result):
                scores[chunk_id] += 0.05
            sources.setdefault(chunk_id, []).append(source_name)

    ordered = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    fused: list[RetrievalResult] = []
    for rank, (chunk_id, score) in enumerate(ordered[:top_k], start=1):
        result = by_id[chunk_id]
        result.chunk.metadata.extra["retrieval_sources"] = sorted(set(sources.get(chunk_id, [])))
        fused.append(RetrievalResult(chunk=result.chunk, score=score, rank=rank))
    return fused


def _is_navigation_result(result: RetrievalResult) -> bool:
    extra = result.chunk.metadata.extra
    block_kind = str(extra.get("block_kind") or "")
    locator = str(extra.get("source_locator") or "").lower()
    title = str(extra.get("title") or "").lower()
    return block_kind == "wiki_outline" or locator.startswith("wiki/index.md") or title == "index"


def _is_navigation_query(query: str) -> bool:
    normalized = query.strip().lower()
    return any(term in normalized for term in ("index", "目录", "索引", "导航", "outline"))
