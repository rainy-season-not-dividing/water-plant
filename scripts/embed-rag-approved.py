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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a limited embedding preview from approved RAG knowledge blocks."
    )
    parser.add_argument("input", type=Path, help="Path to a *.approved.json file.")
    parser.add_argument(
        "--limit",
        type=int,
        required=True,
        help="Maximum number of planned chunks to embed. Required to control development cost.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="Number of texts to embed per API request. Keep at or below 10 for text-embedding-v4.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional JSON output path for the limited embedding preview.",
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

    try:
        chunks, _ = dry_run_approved_file(args.input)
        selected_chunks = chunks[: args.limit]
        provider = ConfiguredEmbeddingProvider()
        started_at = perf_counter()
        vectors = _embed_limited_chunks(provider, selected_chunks, batch_size=args.batch_size)
        elapsed_seconds = perf_counter() - started_at
    except (IngestionValidationError, EmbeddingNotConfiguredError, EmbeddingProviderError) as exc:
        print(f"Embedding preview failed: {exc}", file=sys.stderr)
        return 2

    dimension = len(vectors[0]) if vectors else 0
    print("RAG approved embedding preview")
    print(f"planned_chunks_total: {len(chunks)}")
    print(f"embedded_count: {len(vectors)}")
    print(f"vector_dimension: {dimension}")
    print(f"elapsed_seconds: {elapsed_seconds:.2f}")
    print("storage: not written to Qdrant")

    if args.output is not None:
        _write_preview(args.output, selected_chunks, vectors, dimension=dimension, elapsed_seconds=elapsed_seconds)
        print(f"preview_output: {args.output}")
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


def _write_preview(
    output_path: Path,
    chunks: list[PlannedEmbeddingChunk],
    vectors: list[list[float]],
    *,
    dimension: int,
    elapsed_seconds: float,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "embedded_count": len(vectors),
        "vector_dimension": dimension,
        "elapsed_seconds": elapsed_seconds,
        "items": [
            {
                "chunk_id": chunk.id,
                "approved_block_id": chunk.metadata.get("approved_block_id"),
                "source_locator": chunk.metadata.get("source_locator"),
                "section_path": chunk.metadata.get("section_path"),
                "char_count": chunk.char_count,
                "vector": vector,
            }
            for chunk, vector in zip(chunks, vectors, strict=True)
        ],
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
