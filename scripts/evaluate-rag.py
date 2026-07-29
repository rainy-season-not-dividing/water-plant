from __future__ import annotations

import argparse
import json
from math import log2
import os
from pathlib import Path
import sys
from time import perf_counter
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if not (BACKEND_ROOT / "app").exists():
    BACKEND_ROOT = PROJECT_ROOT
DEFAULT_WIKIDB_ROOT = PROJECT_ROOT.parent / "wikidb" / "wikidb"
sys.path.insert(0, str(BACKEND_ROOT))

from app.rag.embeddings import ConfiguredEmbeddingProvider, EmbeddingNotConfiguredError, EmbeddingProviderError
from app.rag.elasticsearch_store import ConfiguredElasticsearchChunkStore, ElasticsearchStoreError
from app.rag.qdrant_store import ConfiguredQdrantVectorStore, QdrantStoreError
from app.rag.retrievers.elasticsearch import ElasticsearchRetriever
from app.rag.retrievers.hybrid import HybridRetriever
from app.rag.retrievers.keyword import KeywordRetriever
from app.rag.retrievers.qdrant_vector import QdrantVectorRetriever
from app.rag.schemas import RetrievalRequest, RetrievalResult
from app.rag.sources.wiki.config import WikiSourceConfig
from app.rag.sources.wiki.extractor import WikiMarkdownExtractor


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate RAG retrieval quality on a JSONL/JSON eval set.")
    parser.add_argument("eval_set", type=Path, help="JSONL file or JSON array with query/relevance cases.")
    parser.add_argument("--mode", choices=["keyword", "vector", "hybrid"], default="hybrid")
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--ndcg-k", type=int, default=10)
    parser.add_argument("--collection", default=None)
    parser.add_argument("--qdrant-url", default=None)
    parser.add_argument("--index", default=None)
    parser.add_argument("--elasticsearch-url", default=None)
    parser.add_argument("--wikidb-root", type=Path, default=_default_wikidb_root())
    parser.add_argument("--legacy-wiki-keyword", action="store_true")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.top_k <= 0:
        print("--top-k must be greater than 0", file=sys.stderr)
        return 2
    cases = load_eval_cases(args.eval_set)
    if not cases:
        print("eval set is empty", file=sys.stderr)
        return 2

    try:
        retriever = _build_retriever(args)
        evaluated = [evaluate_case(case, retriever, top_k=args.top_k, ndcg_k=args.ndcg_k) for case in cases]
    except (EmbeddingNotConfiguredError, EmbeddingProviderError, ElasticsearchStoreError, QdrantStoreError) as exc:
        print(f"RAG evaluation failed: {exc}", file=sys.stderr)
        return 2

    payload = {
        "mode": args.mode,
        "top_k": args.top_k,
        "ndcg_k": args.ndcg_k,
        "case_count": len(evaluated),
        "metrics": aggregate_metrics(evaluated),
        "cases": evaluated,
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        _print_summary(payload)
    return 0


def load_eval_cases(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        payload = json.loads(text)
        if not isinstance(payload, list):
            raise ValueError("JSON eval set must be an array.")
        return [case for case in payload if isinstance(case, dict)]
    cases = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        payload = json.loads(line)
        if not isinstance(payload, dict):
            raise ValueError(f"line {line_no} must be a JSON object.")
        cases.append(payload)
    return cases


def evaluate_case(case: dict[str, Any], retriever: object, *, top_k: int, ndcg_k: int) -> dict[str, Any]:
    query = str(case.get("query") or "").strip()
    if not query:
        raise ValueError("eval case is missing query.")
    request = RetrievalRequest(
        query=query,
        top_k=top_k,
        agent_id=_optional_str(case.get("agent_id")),
        tenant_id=_optional_str(case.get("tenant_id")),
        roles=_list(case.get("roles")),
        process_areas=_list(case.get("process_areas")),
        device_ids=_list(case.get("device_ids")),
        incident_types=_list(case.get("incident_types")),
        knowledge_types=_list(case.get("knowledge_types")),
    )
    started_at = perf_counter()
    response_or_results = retriever.retrieve(request)
    results = response_or_results.results if hasattr(response_or_results, "results") else response_or_results
    latency_ms = (perf_counter() - started_at) * 1000
    relevant_chunk_ids = set(_list(case.get("relevant_chunk_ids")))
    relevant_doc_ids = set(_list(case.get("relevant_doc_ids")))
    if not relevant_chunk_ids and not relevant_doc_ids:
        raise ValueError(f"eval case {query!r} has no relevant_chunk_ids or relevant_doc_ids.")

    relevances = [_is_relevant(result, relevant_chunk_ids, relevant_doc_ids) for result in results]
    relevant_total = len(relevant_chunk_ids) + len(relevant_doc_ids)
    found_labels = _found_relevance_labels(results, relevant_chunk_ids, relevant_doc_ids)
    return {
        "id": case.get("id"),
        "query": query,
        "latency_ms": round(latency_ms, 2),
        "result_count": len(results),
        "recall_at_k": len(found_labels) / relevant_total if relevant_total else 0.0,
        "mrr": _mrr(relevances),
        "ndcg_at_k": _ndcg(relevances[:ndcg_k], ideal_count=min(relevant_total, ndcg_k)),
        "duplicate_rate": _duplicate_rate(results),
        "doc_concentration": _doc_concentration(results),
        "hit_ranks": [index + 1 for index, relevant in enumerate(relevances) if relevant],
        "results": [_result_summary(result) for result in results],
    }


def aggregate_metrics(cases: list[dict[str, Any]]) -> dict[str, float]:
    keys = ["recall_at_k", "mrr", "ndcg_at_k", "duplicate_rate", "doc_concentration", "latency_ms"]
    return {key: round(sum(float(case[key]) for case in cases) / len(cases), 4) for key in keys}


def _build_retriever(args: argparse.Namespace) -> Any:
    keyword_retriever = None
    if args.mode in {"keyword", "hybrid"}:
        keyword_retriever = _keyword_retriever(args)
    if args.mode == "keyword":
        return keyword_retriever

    provider = ConfiguredEmbeddingProvider()
    store = ConfiguredQdrantVectorStore(url=args.qdrant_url, collection_name=args.collection)
    vector_retriever = QdrantVectorRetriever(embedding_provider=provider, vector_store=store)
    if args.mode == "vector":
        return vector_retriever
    return HybridRetriever(bm25_retriever=keyword_retriever, vector_retriever=vector_retriever)


def _keyword_retriever(args: argparse.Namespace) -> Any:
    if args.legacy_wiki_keyword:
        payload = WikiMarkdownExtractor(config=WikiSourceConfig.from_path(args.wikidb_root)).approved_payload()
        return KeywordRetriever.from_approved_payload(payload)
    store = ConfiguredElasticsearchChunkStore(url=args.elasticsearch_url, index_name=args.index)
    return ElasticsearchRetriever(store=store)


def _is_relevant(result: RetrievalResult, relevant_chunk_ids: set[str], relevant_doc_ids: set[str]) -> bool:
    return result.chunk.id in relevant_chunk_ids or _result_doc_id(result) in relevant_doc_ids


def _found_relevance_labels(
    results: list[RetrievalResult], relevant_chunk_ids: set[str], relevant_doc_ids: set[str]
) -> set[str]:
    found = set()
    for result in results:
        if result.chunk.id in relevant_chunk_ids:
            found.add(f"chunk:{result.chunk.id}")
        doc_id = _result_doc_id(result)
        if doc_id in relevant_doc_ids:
            found.add(f"doc:{doc_id}")
    return found


def _mrr(relevances: list[bool]) -> float:
    for index, relevant in enumerate(relevances, start=1):
        if relevant:
            return 1.0 / index
    return 0.0


def _ndcg(relevances: list[bool], *, ideal_count: int) -> float:
    dcg = sum((1.0 / log2(index + 2)) for index, relevant in enumerate(relevances) if relevant)
    ideal = sum(1.0 / log2(index + 2) for index in range(ideal_count))
    return dcg / ideal if ideal else 0.0


def _duplicate_rate(results: list[RetrievalResult]) -> float:
    if not results:
        return 0.0
    hashes = [_content_hash(result) or result.chunk.id for result in results]
    return (len(hashes) - len(set(hashes))) / len(hashes)


def _doc_concentration(results: list[RetrievalResult]) -> float:
    if not results:
        return 0.0
    counts: dict[str, int] = {}
    for result in results:
        doc_id = _result_doc_id(result)
        counts[doc_id] = counts.get(doc_id, 0) + 1
    return max(counts.values()) / len(results)


def _result_summary(result: RetrievalResult) -> dict[str, Any]:
    metadata = result.chunk.metadata
    return {
        "rank": result.rank,
        "score": result.score,
        "chunk_id": result.chunk.id,
        "doc_id": _result_doc_id(result),
        "source_locator": metadata.extra.get("source_locator"),
        "retrieval_sources": metadata.extra.get("retrieval_sources"),
    }


def _result_doc_id(result: RetrievalResult) -> str:
    extra = result.chunk.metadata.extra
    locator = str(extra.get("source_locator") or "")
    return str(extra.get("doc_id") or extra.get("source_path") or locator.split("#", 1)[0] or result.chunk.metadata.source)


def _content_hash(result: RetrievalResult) -> str:
    return str(result.chunk.metadata.extra.get("content_hash") or "")


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item).strip()]


def _print_summary(payload: dict[str, Any]) -> None:
    print("RAG evaluation")
    print(f"mode: {payload['mode']}")
    print(f"case_count: {payload['case_count']}")
    for key, value in payload["metrics"].items():
        print(f"{key}: {value}")


def _default_wikidb_root() -> Path:
    configured = os.getenv("RAG_WIKIDB_ROOT", "").strip()
    return Path(configured) if configured else DEFAULT_WIKIDB_ROOT


if __name__ == "__main__":
    raise SystemExit(main())
