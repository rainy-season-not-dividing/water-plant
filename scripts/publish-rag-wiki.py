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
from app.rag.ingestion import IngestionValidationError, PlannedEmbeddingChunk, dry_run_approved_payload
from app.rag.qdrant_store import ConfiguredQdrantVectorStore, QdrantStoreError
from app.rag.sources.wiki.config import WikiSourceConfig
from app.rag.sources.wiki.extractor import WikiMarkdownExtractor


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish approved wikidb/wiki Markdown chunks to Qdrant.")
    parser.add_argument("--wikidb-root", type=Path, default=DEFAULT_WIKIDB_ROOT)
    parser.add_argument("--limit", type=int, required=True, help="Maximum chunks to publish.")
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--upsert-batch-size", type=int, default=64)
    parser.add_argument("--collection", default=None)
    parser.add_argument("--qdrant-url", default=None)
    parser.add_argument("--distance", default=None)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.limit <= 0:
        print("--limit must be greater than 0", file=sys.stderr)
        return 2
    try:
        payload = WikiMarkdownExtractor(config=WikiSourceConfig.from_path(args.wikidb_root)).approved_payload()
        chunks = dry_run_approved_payload(payload)[0]
        selected_chunks = chunks[: args.limit]
        if not selected_chunks:
            raise IngestionValidationError("wikidb produced no embedding chunks")

        provider = ConfiguredEmbeddingProvider()
        embedding_started_at = perf_counter()
        vectors = _embed_chunks(provider, selected_chunks, batch_size=args.batch_size)
        embedding_elapsed = perf_counter() - embedding_started_at

        vector_dimension = len(vectors[0]) if vectors else provider.dimension
        store = ConfiguredQdrantVectorStore(
            url=args.qdrant_url,
            collection_name=args.collection,
            vector_dimension=vector_dimension,
            distance=args.distance,
        )
        upsert_started_at = perf_counter()
        upserted_count = _upsert_chunks(store, selected_chunks, vectors, batch_size=args.upsert_batch_size)
        upsert_elapsed = perf_counter() - upsert_started_at
    except (IngestionValidationError, EmbeddingNotConfiguredError, EmbeddingProviderError, QdrantStoreError) as exc:
        print(f"RAG wiki publish failed: {exc}", file=sys.stderr)
        return 2

    summary = {
        "wikidb_root": str(args.wikidb_root),
        "collection": store.collection_name,
        "planned_chunks_total": len(chunks),
        "selected_count": len(selected_chunks),
        "embedded_count": len(vectors),
        "upserted_count": upserted_count,
        "vector_dimension": vector_dimension,
        "embedding_elapsed_seconds": round(embedding_elapsed, 2),
        "upsert_elapsed_seconds": round(upsert_elapsed, 2),
    }
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        print("RAG wiki publish")
        for key, value in summary.items():
            print(f"{key}: {value}")
    return 0


def _embed_chunks(
    provider: ConfiguredEmbeddingProvider,
    chunks: list[PlannedEmbeddingChunk],
    *,
    batch_size: int,
) -> list[list[float]]:
    vectors: list[list[float]] = []
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        vectors.extend(provider.embed_texts([chunk.text_for_embedding for chunk in batch]))
    return vectors


def _upsert_chunks(
    store: ConfiguredQdrantVectorStore,
    chunks: list[PlannedEmbeddingChunk],
    vectors: list[list[float]],
    *,
    batch_size: int,
) -> int:
    count = 0
    for start in range(0, len(chunks), batch_size):
        count += store.upsert_embedding_chunks(chunks[start : start + batch_size], vectors[start : start + batch_size])
    return count


if __name__ == "__main__":
    raise SystemExit(main())
