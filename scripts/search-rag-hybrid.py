from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from time import perf_counter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
DEFAULT_WIKIDB_ROOT = PROJECT_ROOT.parent / "wikidb" / "wikidb"
sys.path.insert(0, str(BACKEND_ROOT))

from app.rag.embeddings import ConfiguredEmbeddingProvider, EmbeddingNotConfiguredError, EmbeddingProviderError
from app.rag.qdrant_store import ConfiguredQdrantVectorStore, QdrantStoreError
from app.rag.retriever import RagRetriever
from app.rag.retrievers.hybrid import HybridRetriever
from app.rag.retrievers.keyword import KeywordRetriever
from app.rag.retrievers.vector import VectorRetriever
from app.rag.schemas import RetrievalRequest, RetrievalResult
from app.rag.sources.wiki.config import WikiSourceConfig
from app.rag.sources.wiki.extractor import WikiMarkdownExtractor


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare keyword, vector, and hybrid RAG search.")
    parser.add_argument("query")
    parser.add_argument("--mode", choices=["keyword", "vector", "hybrid"], default="hybrid")
    parser.add_argument("--wikidb-root", type=Path, default=DEFAULT_WIKIDB_ROOT)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--collection", default=None)
    parser.add_argument("--qdrant-url", default=None)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    request = RetrievalRequest(query=args.query, top_k=args.top_k)
    started_at = perf_counter()
    try:
        results = _retrieve(args, request)
    except (EmbeddingNotConfiguredError, EmbeddingProviderError, QdrantStoreError) as exc:
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
    keyword_retriever = None
    if args.mode in {"keyword", "hybrid"}:
        payload = WikiMarkdownExtractor(config=WikiSourceConfig.from_path(args.wikidb_root)).approved_payload()
        keyword_retriever = KeywordRetriever.from_approved_payload(payload)
    if args.mode == "keyword":
        return keyword_retriever.retrieve(request)

    provider = ConfiguredEmbeddingProvider()
    store = ConfiguredQdrantVectorStore(url=args.qdrant_url, collection_name=args.collection)
    vector_retriever = VectorRetriever(RagRetriever(embedding_provider=provider, vector_store=store))
    if args.mode == "vector":
        return vector_retriever.retrieve(request)

    return HybridRetriever(keyword_retriever=keyword_retriever, vector_retriever=vector_retriever).retrieve(request)


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
