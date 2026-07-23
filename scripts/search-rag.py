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
from app.rag.qdrant_store import ConfiguredQdrantVectorStore, QdrantStoreError
from app.rag.retriever import RagRetriever
from app.rag.schemas import RetrievalRequest, RetrievalResult


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a real RAG search against the configured embedding provider and Qdrant."
    )
    parser.add_argument("query", help="Question or search query to embed and retrieve.")
    parser.add_argument("--top-k", type=int, default=5, help="Number of Qdrant results to return.")
    parser.add_argument("--agent-id", help="Optional agent_scope filter.")
    parser.add_argument("--process-area", action="append", default=[], help="Optional process_areas filter.")
    parser.add_argument("--device-id", action="append", default=[], help="Optional device_ids filter.")
    parser.add_argument("--incident-type", action="append", default=[], help="Optional incident_types filter.")
    parser.add_argument("--knowledge-type", action="append", default=[], help="Optional knowledge_types filter.")
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
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional JSON output path for the search result.",
    )
    parser.add_argument("--json", action="store_true", help="Print search result as JSON.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.top_k <= 0:
        print("--top-k must be greater than 0", file=sys.stderr)
        return 2

    try:
        started_at = perf_counter()
        provider = ConfiguredEmbeddingProvider()
        store = ConfiguredQdrantVectorStore(url=args.qdrant_url, collection_name=args.collection)
        retriever = RagRetriever(embedding_provider=provider, vector_store=store)
        request = RetrievalRequest(
            query=args.query,
            agent_id=args.agent_id,
            top_k=args.top_k,
            process_areas=args.process_area,
            device_ids=args.device_id,
            incident_types=args.incident_type,
            knowledge_types=args.knowledge_type,
        )
        results = retriever.retrieve(request)
        elapsed_seconds = perf_counter() - started_at
    except (EmbeddingNotConfiguredError, EmbeddingProviderError, QdrantStoreError) as exc:
        print(f"RAG search failed: {exc}", file=sys.stderr)
        return 2

    payload = search_payload(
        request=request,
        collection=store.collection_name,
        vector_dimension=store.vector_dimension,
        elapsed_seconds=elapsed_seconds,
        results=results,
    )
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        _print_results(payload)
        if args.output is not None:
            print(f"output: {args.output}")
    return 0


def search_payload(
    *,
    request: RetrievalRequest,
    collection: str,
    vector_dimension: int,
    elapsed_seconds: float,
    results: list[RetrievalResult],
) -> dict:
    return {
        "query": request.query,
        "collection": collection,
        "top_k": request.top_k,
        "vector_dimension": vector_dimension,
        "elapsed_seconds": round(elapsed_seconds, 2),
        "result_count": len(results),
        "filters": {
            "agent_id": request.agent_id,
            "process_areas": request.process_areas,
            "device_ids": request.device_ids,
            "incident_types": request.incident_types,
            "knowledge_types": request.knowledge_types,
        },
        "results": [_result_to_dict(result) for result in results],
    }


def _result_to_dict(result: RetrievalResult) -> dict:
    metadata = result.chunk.metadata
    return {
        "rank": result.rank,
        "score": result.score,
        "chunk_id": result.chunk.id,
        "text": result.chunk.text,
        "source": metadata.source,
        "knowledge_type": metadata.knowledge_type,
        "agent_scope": metadata.agent_scope,
        "process_areas": metadata.process_areas,
        "device_ids": metadata.device_ids,
        "incident_types": metadata.incident_types,
        "source_version": metadata.source_version,
        "safety_level": metadata.safety_level,
        "effective_time": metadata.effective_time,
        "title": metadata.extra.get("title"),
        "section_path": metadata.extra.get("section_path"),
        "source_locator": metadata.extra.get("source_locator"),
        "block_kind": metadata.extra.get("block_kind"),
    }


def _print_results(payload: dict) -> None:
    print("RAG search")
    print(f"query: {payload['query']}")
    print(f"collection: {payload['collection']}")
    print(f"top_k: {payload['top_k']}")
    print(f"result_count: {payload['result_count']}")
    print(f"elapsed_seconds: {payload['elapsed_seconds']:.2f}")
    for result in payload["results"]:
        print("")
        print(f"#{result['rank']} score={result['score']:.4f}")
        print(f"source: {result['source']}")
        print(f"section_path: {_join_section_path(result.get('section_path'))}")
        print(f"source_locator: {result['source_locator']}")
        print(f"text: {_compact_text(result['text'])}")


def _join_section_path(value: object) -> str:
    if not isinstance(value, list):
        return ""
    return " / ".join(str(item) for item in value)


def _compact_text(text: str, *, max_length: int = 260) -> str:
    compact = " ".join(text.split())
    if len(compact) <= max_length:
        return compact
    return f"{compact[: max_length - 3]}..."


if __name__ == "__main__":
    raise SystemExit(main())
