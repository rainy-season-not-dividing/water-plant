from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from time import perf_counter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if not (BACKEND_ROOT / "app").exists():
    BACKEND_ROOT = PROJECT_ROOT
sys.path.insert(0, str(BACKEND_ROOT))

from app.rag.embeddings import ConfiguredEmbeddingProvider, EmbeddingNotConfiguredError, EmbeddingProviderError
from app.rag.elasticsearch_store import ConfiguredElasticsearchChunkStore, ElasticsearchStoreError
from app.rag.qdrant_store import ConfiguredQdrantVectorStore, QdrantStoreError
from app.rag.retrievers.hybrid import HybridRetriever
from app.rag.retrievers.elasticsearch import ElasticsearchRetriever
from app.rag.retrievers.qdrant_vector import QdrantVectorRetriever
from app.rag.schemas import RetrievalRequest, RetrievalResult


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare keyword, vector, and hybrid RAG search.")
    parser.add_argument("query")
    parser.add_argument("--mode", choices=["keyword", "vector", "hybrid"], default="hybrid")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--collection", default=None)
    parser.add_argument("--qdrant-url", default=None)
    parser.add_argument("--elasticsearch-url", default=None)
    parser.add_argument("--index", default=None)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    request = RetrievalRequest(query=args.query, top_k=args.top_k)
    started_at = perf_counter()
    try:
        results = _retrieve(args, request)
    except (EmbeddingNotConfiguredError, EmbeddingProviderError, ElasticsearchStoreError, QdrantStoreError) as exc:
        print(f"RAG hybrid search failed: {exc}", file=sys.stderr)
        return 2
    elapsed = perf_counter() - started_at

    payload = {
        "query": request.query,
        "mode": args.mode,
        "top_k": request.top_k,
        "elapsed_seconds": round(elapsed, 2),
        "result_count": len(results),
        "results": [_result_to_dict(result) for result in results],
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        _print_payload(payload)
    return 0


def _retrieve(args: argparse.Namespace, request: RetrievalRequest) -> list[RetrievalResult]:
    bm25_retriever = None
    if args.mode in {"keyword", "hybrid"}:
        bm25_retriever = _bm25_retriever(args)
    if args.mode == "keyword":
        return bm25_retriever.retrieve(request)

    provider = ConfiguredEmbeddingProvider()
    store = ConfiguredQdrantVectorStore(url=args.qdrant_url, collection_name=args.collection)
    vector_retriever = QdrantVectorRetriever(embedding_provider=provider, vector_store=store)
    if args.mode == "vector":
        return vector_retriever.retrieve(request)

    return HybridRetriever(bm25_retriever=bm25_retriever, vector_retriever=vector_retriever).retrieve(request).results


def _bm25_retriever(args: argparse.Namespace):
    store = ConfiguredElasticsearchChunkStore(url=args.elasticsearch_url, index_name=args.index)
    return ElasticsearchRetriever(store=store)


def _result_to_dict(result: RetrievalResult) -> dict:
    metadata = result.chunk.metadata
    return {
        "rank": result.rank,
        "score": result.score,
        "chunk_id": result.chunk.id,
        "text": result.chunk.text,
        "source": metadata.source,
        "knowledge_type": metadata.knowledge_type,
        "section_path": metadata.extra.get("section_path"),
        "source_locator": metadata.extra.get("source_locator"),
        "retrieval_sources": metadata.extra.get("retrieval_sources"),
    }


def _print_payload(payload: dict) -> None:
    print("RAG hybrid search")
    print(f"query: {payload['query']}")
    print(f"mode: {payload['mode']}")
    print(f"result_count: {payload['result_count']}")
    print(f"elapsed_seconds: {payload['elapsed_seconds']:.2f}")
    for result in payload["results"]:
        print("")
        print(f"#{result['rank']} score={result['score']:.4f}")
        print(f"source: {result['source']}")
        print(f"section_path: {_join(result.get('section_path'))}")
        print(f"source_locator: {result['source_locator']}")
        print(f"sources: {_join(result.get('retrieval_sources'))}")
        print(f"text: {_compact(result['text'])}")


def _join(value: object) -> str:
    if not isinstance(value, list):
        return ""
    return " / ".join(str(item) for item in value)


def _compact(text: str, *, max_length: int = 260) -> str:
    compact = " ".join(text.split())
    if len(compact) <= max_length:
        return compact
    return f"{compact[: max_length - 3]}..."


if __name__ == "__main__":
    raise SystemExit(main())
