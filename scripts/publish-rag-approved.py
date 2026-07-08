from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from time import perf_counter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.rag.embeddings import ConfiguredEmbeddingProvider, EmbeddingNotConfiguredError, EmbeddingProviderError
from app.rag.ingestion import IngestionValidationError, PlannedEmbeddingChunk, dry_run_approved_file
from app.rag.qdrant_store import ConfiguredQdrantVectorStore, QdrantStoreError


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Publish limited approved RAG chunks to a Qdrant development collection."
    )
    parser.add_argument("input", type=Path, help="Path to a *.approved.json file.")
    parser.add_argument(
        "--limit",
        type=int,
        required=True,
        help="Maximum number of planned chunks to embed and upsert. Required for development safety.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Number of texts to embed per API request.",
    )
    parser.add_argument(
        "--upsert-batch-size",
        type=int,
        default=64,
        help="Number of Qdrant points to upsert per request.",
    )
    parser.add_argument(
        "--collection",
        default=None,
        help="Qdrant collection name. Defaults to RAG_QDRANT_COLLECTION or water_plant_rag_dev.",
    )
    parser.add_argument(
        "--qdrant-url",
        default=None,
        help="Qdrant URL. Defaults to QDRANT_URL or http://127.0.0.1:6333.",
    )
    parser.add_argument(
        "--distance",
        default=None,
        help="Qdrant vector distance. Defaults to RAG_QDRANT_DISTANCE or Cosine.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print publish summary as JSON.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.limit <= 0:
        print("--limit must be greater than 0", file=sys.stderr)
        return 2
    if args.batch_size <= 0:
        print("--batch-size must be greater than 0", file=sys.stderr)
        return 2
    if args.upsert_batch_size <= 0:
        print("--upsert-batch-size must be greater than 0", file=sys.stderr)
        return 2

    try:
        chunks, dry_run_report = dry_run_approved_file(args.input)
        selected_chunks = chunks[: args.limit]
        if not selected_chunks:
            raise IngestionValidationError("approved file produced no embedding chunks")

        provider = ConfiguredEmbeddingProvider()
        embedding_started_at = perf_counter()
        vectors = _embed_limited_chunks(provider, selected_chunks, batch_size=args.batch_size)
        embedding_elapsed = perf_counter() - embedding_started_at

        vector_dimension = len(vectors[0]) if vectors else provider.dimension
        store = ConfiguredQdrantVectorStore(
            url=args.qdrant_url,
            collection_name=args.collection,
            vector_dimension=vector_dimension,
            distance=args.distance,
        )

        upsert_started_at = perf_counter()
        upserted_count = _upsert_limited_chunks(
            store,
            selected_chunks,
            vectors,
            batch_size=args.upsert_batch_size,
        )
        upsert_elapsed = perf_counter() - upsert_started_at
    except (IngestionValidationError, EmbeddingNotConfiguredError, EmbeddingProviderError, QdrantStoreError) as exc:
        print(f"RAG publish failed: {exc}", file=sys.stderr)
        return 2

    summary = {
        "input": str(args.input),
        "source": dry_run_report.source,
        "collection": store.collection_name,
        "planned_chunks_total": len(chunks),
        "selected_count": len(selected_chunks),
        "embedded_count": len(vectors),
        "upserted_count": upserted_count,
        "vector_dimension": vector_dimension,
        "embedding_elapsed_seconds": round(embedding_elapsed, 2),
        "upsert_elapsed_seconds": round(upsert_elapsed, 2),
        "storage": "written to Qdrant",
    }

    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        _print_summary(summary)
    return 0


def _embed_limited_chunks(
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


def _upsert_limited_chunks(
    store: ConfiguredQdrantVectorStore,
    chunks: list[PlannedEmbeddingChunk],
    vectors: list[list[float]],
    *,
    batch_size: int,
) -> int:
    upserted_count = 0
    for start in range(0, len(chunks), batch_size):
        chunk_batch = chunks[start : start + batch_size]
        vector_batch = vectors[start : start + batch_size]
        upserted_count += store.upsert_embedding_chunks(chunk_batch, vector_batch)
    return upserted_count


def _print_summary(summary: dict) -> None:
    print("RAG approved publish")
    print(f"input: {summary['input']}")
    print(f"source: {summary['source']}")
    print(f"collection: {summary['collection']}")
    print(f"planned_chunks_total: {summary['planned_chunks_total']}")
    print(f"selected_count: {summary['selected_count']}")
    print(f"embedded_count: {summary['embedded_count']}")
    print(f"upserted_count: {summary['upserted_count']}")
    print(f"vector_dimension: {summary['vector_dimension']}")
    print(f"embedding_elapsed_seconds: {summary['embedding_elapsed_seconds']:.2f}")
    print(f"upsert_elapsed_seconds: {summary['upsert_elapsed_seconds']:.2f}")
    print(f"storage: {summary['storage']}")


if __name__ == "__main__":
    raise SystemExit(main())
