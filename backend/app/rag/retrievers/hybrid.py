from __future__ import annotations

import os
from dataclasses import replace
from time import perf_counter
from typing import Any

from ..reranker import ConfiguredReranker, RerankError, configured_final_top_k, configured_rerank_top_n, rerank_enabled
from ..retrieval_log import log_retrieval_event
from ..schemas import RetrievalRequest, RetrievalResponse, RetrievalResult, RetrievalStatus


class HybridRetriever:
    """Fuse ES BM25 and Qdrant vector retrieval with reciprocal rank fusion."""

    def __init__(
        self,
        *,
        bm25_retriever: object | None = None,
        vector_retriever: object,
        keyword_retriever: object | None = None,
        rrf_k: int = 60,
        bm25_weight: float = 1.0,
        vector_weight: float = 1.0,
        candidate_k: int = 80,
        fusion_keep: int = 50,
        doc_chunk_limit: int = 3,
    ) -> None:
        self.bm25_retriever = bm25_retriever or keyword_retriever
        if self.bm25_retriever is None:
            raise ValueError("bm25_retriever is required")
        self.vector_retriever = vector_retriever
        self.rrf_k = rrf_k
        self.bm25_weight = bm25_weight
        self.vector_weight = vector_weight
        self.candidate_k = candidate_k
        self.fusion_keep = fusion_keep
        self.doc_chunk_limit = doc_chunk_limit

    def retrieve(self, request: RetrievalRequest) -> RetrievalResponse:
        expanded = replace(request, top_k=max(self.candidate_k, request.top_k))
        started_at = perf_counter()
        bm25_results, bm25_latency, bm25_error = _timed_retrieve(self.bm25_retriever, expanded)
        vector_results, vector_latency, vector_error = _timed_retrieve(self.vector_retriever, expanded)

        base_metadata = {
            "mode": "hybrid",
            "requested_top_k": request.top_k,
            "candidate_k": expanded.top_k,
            "bm25_latency_ms": round(bm25_latency * 1000, 2),
            "vector_latency_ms": round(vector_latency * 1000, 2),
        }
        if bm25_error and vector_error:
            response = RetrievalResponse(
                status="failed",
                failed_sources=_failed_sources(bm25_error, vector_error),
                errors=_retrieval_errors(bm25_error, vector_error),
                source_counts={"bm25": 0, "vector": 0},
                metadata={**base_metadata, "elapsed_ms": round((perf_counter() - started_at) * 1000, 2)},
            )
            log_retrieval_event(_log_payload(request, expanded, response, fusion={}, rerank_error=""))
            return response

        final_top_k = configured_final_top_k(request.top_k)
        fused_results, stats = fuse_results_with_stats(
            bm25_results=bm25_results,
            vector_results=vector_results,
            top_k=max(final_top_k, configured_rerank_top_n(final_top_k) if rerank_enabled() else final_top_k),
            rrf_k=self.rrf_k,
            bm25_weight=self.bm25_weight,
            vector_weight=self.vector_weight,
            fusion_keep=self.fusion_keep,
            doc_chunk_limit=self.doc_chunk_limit,
            include_navigation=_is_navigation_query(request.query),
        )
        results = fused_results[:final_top_k]
        rerank_error = ""
        if rerank_enabled() and fused_results:
            try:
                results = ConfiguredReranker().rerank(
                    query=request.query,
                    results=fused_results,
                    top_n=min(configured_rerank_top_n(final_top_k), final_top_k, len(fused_results)),
                )
            except (RerankError, ValueError) as exc:
                rerank_error = str(exc)
                results = fused_results[:final_top_k]

        response = RetrievalResponse(
            status=_response_status(bm25_error=bm25_error, vector_error=vector_error, results=results),
            results=results,
            failed_sources=_failed_sources(bm25_error, vector_error),
            errors=_retrieval_errors(bm25_error, vector_error, rerank_error),
            source_counts={"bm25": len(bm25_results), "vector": len(vector_results)},
            metadata={
                **base_metadata,
                "final_top_k": final_top_k,
                "elapsed_ms": round((perf_counter() - started_at) * 1000, 2),
                "fusion": stats,
                "rerank_enabled": rerank_enabled(),
                "rerank_applied": rerank_enabled() and not rerank_error and bool(fused_results),
            },
        )
        log_retrieval_event(_log_payload(request, expanded, response, fusion=stats, rerank_error=rerank_error))
        return response


def fuse_results(
    *,
    bm25_results: list[RetrievalResult] | None = None,
    vector_results: list[RetrievalResult],
    keyword_results: list[RetrievalResult] | None = None,
    top_k: int,
    rrf_k: int = 60,
    bm25_weight: float = 1.0,
    vector_weight: float = 1.0,
    fusion_keep: int = 50,
    doc_chunk_limit: int = 3,
    include_navigation: bool = False,
) -> list[RetrievalResult]:
    fused, _ = fuse_results_with_stats(
        bm25_results=bm25_results if bm25_results is not None else keyword_results or [],
        vector_results=vector_results,
        top_k=top_k,
        rrf_k=rrf_k,
        bm25_weight=bm25_weight,
        vector_weight=vector_weight,
        fusion_keep=fusion_keep,
        doc_chunk_limit=doc_chunk_limit,
        include_navigation=include_navigation,
    )
    return fused


def fuse_results_with_stats(
    *,
    bm25_results: list[RetrievalResult] | None = None,
    vector_results: list[RetrievalResult],
    keyword_results: list[RetrievalResult] | None = None,
    top_k: int,
    rrf_k: int = 60,
    bm25_weight: float = 1.0,
    vector_weight: float = 1.0,
    fusion_keep: int = 50,
    doc_chunk_limit: int = 3,
    include_navigation: bool = False,
) -> tuple[list[RetrievalResult], dict[str, Any]]:
    bm25_results = bm25_results if bm25_results is not None else keyword_results or []
    by_id: dict[str, RetrievalResult] = {}
    scores: dict[str, float] = {}
    sources: dict[str, list[str]] = {}
    stats: dict[str, Any] = {
        "candidate_total": len(bm25_results) + len(vector_results),
        "unique_candidate_count": 0,
        "duplicate_candidate_count": 0,
        "filtered_navigation_count": 0,
        "filtered_source_note_count": 0,
        "filtered_duplicate_content_count": 0,
        "filtered_doc_limit_count": 0,
        "fusion_keep": fusion_keep,
        "doc_chunk_limit": doc_chunk_limit,
    }

    for source_name, weight, results in (
        ("bm25", bm25_weight, bm25_results),
        ("vector", vector_weight, vector_results),
    ):
        for result in results:
            chunk_id = result.chunk.id
            if _is_navigation_result(result) and not include_navigation:
                stats["filtered_navigation_count"] += 1
                continue
            if _is_source_note_result(result):
                stats["filtered_source_note_count"] += 1
                continue
            if chunk_id in by_id:
                stats["duplicate_candidate_count"] += 1
            by_id.setdefault(chunk_id, result)
            scores[chunk_id] = scores.get(chunk_id, 0.0) + weight / (rrf_k + result.rank)
            if include_navigation and _is_navigation_result(result):
                scores[chunk_id] += 0.05
            sources.setdefault(chunk_id, []).append(source_name)
    stats["unique_candidate_count"] = len(scores)

    ordered = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    fused: list[RetrievalResult] = []
    seen_content_hashes: set[str] = set()
    doc_counts: dict[str, int] = {}
    for chunk_id, score in ordered[:fusion_keep]:
        result = by_id[chunk_id]
        content_hash = str(result.chunk.metadata.extra.get("content_hash") or "")
        if content_hash and content_hash in seen_content_hashes:
            stats["filtered_duplicate_content_count"] += 1
            continue
        doc_id = str(result.chunk.metadata.extra.get("doc_id") or result.chunk.metadata.extra.get("source_path") or "")
        if doc_id and doc_counts.get(doc_id, 0) >= doc_chunk_limit:
            stats["filtered_doc_limit_count"] += 1
            continue
        if content_hash:
            seen_content_hashes.add(content_hash)
        if doc_id:
            doc_counts[doc_id] = doc_counts.get(doc_id, 0) + 1
        result.chunk.metadata.extra["retrieval_sources"] = sorted(set(sources.get(chunk_id, [])))
        fused.append(RetrievalResult(chunk=result.chunk, score=score, rank=len(fused) + 1))
        if len(fused) >= top_k:
            break
    stats["final_candidate_count"] = len(fused)
    stats["doc_counts"] = doc_counts
    return fused, stats


def _timed_retrieve(retriever: object, request: RetrievalRequest) -> tuple[list[RetrievalResult], float, str]:
    started_at = perf_counter()
    try:
        retrieve = getattr(retriever, "retrieve")
        results = retrieve(request)
        if isinstance(results, list):
            return results, perf_counter() - started_at, ""
        return [], perf_counter() - started_at, "retriever_returned_non_list"
    except Exception as exc:
        if _raise_retrieval_errors():
            raise
        return [], perf_counter() - started_at, f"{type(exc).__name__}: {exc}"


def _fallback_reasons(bm25_error: str, vector_error: str, rerank_error: str) -> list[str]:
    reasons = []
    if bm25_error:
        reasons.append(f"bm25_failed:{bm25_error}")
    if vector_error:
        reasons.append(f"vector_failed:{vector_error}")
    if rerank_error:
        reasons.append(f"rerank_failed:{rerank_error}")
    return reasons


def _failed_sources(bm25_error: str, vector_error: str) -> list[str]:
    sources = []
    if bm25_error:
        sources.append("bm25")
    if vector_error:
        sources.append("vector")
    return sources


def _retrieval_errors(bm25_error: str, vector_error: str, rerank_error: str = "") -> dict[str, str]:
    errors = {}
    if bm25_error:
        errors["bm25"] = bm25_error
    if vector_error:
        errors["vector"] = vector_error
    if rerank_error:
        errors["reranker"] = rerank_error
    return errors


def _response_status(
    *,
    bm25_error: str,
    vector_error: str,
    results: list[RetrievalResult],
) -> RetrievalStatus:
    if bm25_error and vector_error:
        return "failed"
    if not results:
        return "no_results"
    if bm25_error:
        return "degraded_vector_only"
    if vector_error:
        return "degraded_bm25_only"
    return "hybrid"


def _log_payload(
    request: RetrievalRequest,
    expanded: RetrievalRequest,
    response: RetrievalResponse,
    *,
    fusion: dict[str, Any],
    rerank_error: str,
) -> dict[str, Any]:
    return {
        "query": request.query,
        "mode": "hybrid",
        "status": response.status,
        "agent_id": request.agent_id,
        "tenant_id": request.tenant_id,
        "roles": request.roles,
        "requested_top_k": request.top_k,
        "final_top_k": response.metadata.get("final_top_k", request.top_k),
        "candidate_k": expanded.top_k,
        "bm25_count": response.source_counts.get("bm25", 0),
        "vector_count": response.source_counts.get("vector", 0),
        "bm25_latency_ms": response.metadata.get("bm25_latency_ms"),
        "vector_latency_ms": response.metadata.get("vector_latency_ms"),
        "elapsed_ms": response.metadata.get("elapsed_ms"),
        "failed_sources": response.failed_sources,
        "fallback_reasons": _fallback_reasons(
            response.errors.get("bm25", ""),
            response.errors.get("vector", ""),
            rerank_error,
        ),
        "fusion": fusion,
        "final_chunk_ids": [result.chunk.id for result in response.results],
        "final_doc_ids": [_doc_id(result) for result in response.results],
        "rerank_enabled": response.metadata.get("rerank_enabled", rerank_enabled()),
        "rerank_applied": response.metadata.get("rerank_applied", False),
    }


def _doc_id(result: RetrievalResult) -> str:
    extra = result.chunk.metadata.extra
    return str(extra.get("doc_id") or extra.get("source_path") or extra.get("source_locator") or result.chunk.metadata.source)


def _raise_retrieval_errors() -> bool:
    return os.getenv("RAG_RETRIEVAL_RAISE_ERRORS", "false").strip().lower() in {"1", "true", "yes", "on"}


def _is_navigation_result(result: RetrievalResult) -> bool:
    extra = result.chunk.metadata.extra
    block_kind = str(extra.get("block_kind") or "")
    locator = str(extra.get("source_locator") or "").lower()
    title = str(extra.get("title") or "").lower()
    return block_kind == "wiki_outline" or locator.startswith("wiki/index.md") or title == "index"


def _is_source_note_result(result: RetrievalResult) -> bool:
    extra = result.chunk.metadata.extra
    title = str(extra.get("title") or "").strip().lower()
    section_path = extra.get("section_path")
    tail = ""
    if isinstance(section_path, list) and section_path:
        tail = str(section_path[-1]).strip().lower()
    compact_text = " ".join(result.chunk.text.split()).lower()
    return title == "来源" or tail == "来源" or compact_text.startswith("- raw/")


def _is_navigation_query(query: str) -> bool:
    normalized = query.strip().lower()
    return any(term in normalized for term in ("index", "目录", "索引", "导航", "outline"))
