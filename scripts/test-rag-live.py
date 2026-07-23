from __future__ import annotations

import argparse
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if not (BACKEND_ROOT / "app").exists():
    BACKEND_ROOT = PROJECT_ROOT
sys.path.insert(0, str(BACKEND_ROOT))

from app.rag.embeddings import ConfiguredEmbeddingProvider, EmbeddingNotConfiguredError, EmbeddingProviderError
from app.rag.qdrant_store import ConfiguredQdrantVectorStore, QdrantStoreError
from app.rag.retriever import RagRetriever
from app.rag.schemas import RetrievalRequest, RetrievalResult


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a live RAG smoke test with the real embedding API and Qdrant."
    )
    parser.add_argument("query", help="Question or search query to verify.")
    parser.add_argument("--top-k", type=int, default=5, help="Number of Qdrant results to request.")
    parser.add_argument(
        "--min-results",
        type=int,
        default=1,
        help="Minimum result count required for the smoke test to pass.",
    )
    parser.add_argument(
        "--expect-source-contains",
        help="Optional substring that at least one result source should contain.",
    )
    parser.add_argument(
        "--collection",
        default=None,
        help="Qdrant collection name. Defaults to RAG_QDRANT_COLLECTION or water_plant_rag_chunks.",
    )
    parser.add_argument(
        "--qdrant-url",
        default=None,
        help="Qdrant URL. Defaults to QDRANT_URL or http://127.0.0.1:6333.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.top_k <= 0:
        print("--top-k must be greater than 0", file=sys.stderr)
        return 2
    if args.min_results < 0:
        print("--min-results must not be negative", file=sys.stderr)
        return 2

    try:
        provider = ConfiguredEmbeddingProvider()
        store = ConfiguredQdrantVectorStore(url=args.qdrant_url, collection_name=args.collection)
        retriever = RagRetriever(embedding_provider=provider, vector_store=store)
        request = RetrievalRequest(query=args.query, top_k=args.top_k)
        results = retriever.retrieve(request)
        _assert_live_results(
            results,
            min_results=args.min_results,
            expect_source_contains=args.expect_source_contains,
        )
    except (EmbeddingNotConfiguredError, EmbeddingProviderError, QdrantStoreError, AssertionError) as exc:
        print(f"RAG live smoke test failed: {exc}", file=sys.stderr)
        return 2

    print("RAG live smoke test passed")
    print(f"query: {args.query}")
    print(f"collection: {store.collection_name}")
    print(f"result_count: {len(results)}")
    if results:
        first = results[0]
        print(f"top_score: {first.score:.4f}")
        print(f"top_source: {first.chunk.metadata.source}")
        print(f"top_source_locator: {first.chunk.metadata.extra.get('source_locator')}")
        print(f"top_text: {_compact_text(first.chunk.text)}")
    return 0


def _assert_live_results(
    results: list[RetrievalResult],
    *,
    min_results: int,
    expect_source_contains: str | None,
) -> None:
    if len(results) < min_results:
        raise AssertionError(f"expected at least {min_results} results, got {len(results)}")
    for result in results:
        if not result.chunk.id:
            raise AssertionError(f"result #{result.rank} missing chunk id")
        if not result.chunk.text.strip():
            raise AssertionError(f"result #{result.rank} missing text")
        if not result.chunk.metadata.source:
            raise AssertionError(f"result #{result.rank} missing source")
        if not result.chunk.metadata.extra.get("source_locator"):
            raise AssertionError(f"result #{result.rank} missing source_locator")
    if expect_source_contains:
        expected = expect_source_contains.lower()
        if not any(expected in result.chunk.metadata.source.lower() for result in results):
            raise AssertionError(f"no result source contains {expect_source_contains!r}")


def _compact_text(text: str, *, max_length: int = 180) -> str:
    compact = " ".join(text.split())
    if len(compact) <= max_length:
        return compact
    return f"{compact[: max_length - 3]}..."


if __name__ == "__main__":
    raise SystemExit(main())
