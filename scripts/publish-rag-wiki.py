from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
import json
import os
from pathlib import Path
import sys
from time import perf_counter
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
DEFAULT_WIKIDB_ROOT = PROJECT_ROOT.parent / "wikidb" / "wikidb"
sys.path.insert(0, str(BACKEND_ROOT))

from app.rag.embeddings import ConfiguredEmbeddingProvider, EmbeddingNotConfiguredError, EmbeddingProviderError
from app.rag.ingestion import IngestionValidationError, PlannedEmbeddingChunk, dry_run_approved_payload
from app.rag.qdrant_store import (
    DEFAULT_COLLECTION,
    DEFAULT_DISTANCE,
    DEFAULT_VECTOR_DIMENSION,
    ConfiguredQdrantVectorStore,
    QdrantStoreError,
    stable_point_id,
)
from app.rag.sources.wiki.config import WikiSourceConfig
from app.rag.sources.wiki.extractor import WikiMarkdownExtractor
from app.rag.wiki_publish_ledger import (
    default_wiki_publish_ledger_path,
    file_sha1,
    ledger_entry_is_current,
    load_wiki_publish_ledger,
    normalize_wiki_document_path,
    save_wiki_publish_ledger,
)


@dataclass(slots=True)
class WikiDocumentPlan:
    relative_path: str
    path: Path
    file_sha1: str
    chunks: list[PlannedEmbeddingChunk]

    @property
    def point_ids(self) -> list[str]:
        return [stable_point_id(chunk.id) for chunk in self.chunks]

    @property
    def source_locators(self) -> list[str]:
        return [str(chunk.metadata.get("source_locator") or "") for chunk in self.chunks]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Publish wikidb/wiki Markdown documents to Qdrant using a document-level ledger."
    )
    parser.add_argument("--wikidb-root", type=Path, default=DEFAULT_WIKIDB_ROOT)
    parser.add_argument(
        "--document",
        action="append",
        default=[],
        help="Wiki document to publish, e.g. RO处置顺序.md or wiki/RO处置顺序.md. Can be repeated.",
    )
    parser.add_argument(
        "--assume-published-unselected",
        action="store_true",
        help="When --document is used, record unselected Wiki docs as an already-published baseline.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Republish selected documents even if the ledger says they are current or changed.",
    )
    parser.add_argument("--ledger", type=Path, default=None, help="Path to .qdrant_published.json.")
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--upsert-batch-size", type=int, default=64)
    parser.add_argument("--collection", default=None)
    parser.add_argument("--qdrant-url", default=None)
    parser.add_argument("--distance", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.batch_size <= 0:
        print("--batch-size must be greater than 0", file=sys.stderr)
        return 2
    if args.upsert_batch_size <= 0:
        print("--upsert-batch-size must be greater than 0", file=sys.stderr)
        return 2

    _load_dotenv_files()
    embedding_model = _env("RAG_EMBEDDING_MODEL", "EMBEDDING_MODEL", default="text-embedding-v4")
    vector_dimension = int(_env("RAG_VECTOR_DIMENSION", "RAG_EMBEDDING_DIMENSION", "EMBEDDING_DIMENSION", default=str(DEFAULT_VECTOR_DIMENSION)))
    collection = args.collection or _env("RAG_QDRANT_COLLECTION", default=DEFAULT_COLLECTION)
    distance = args.distance or _env("RAG_QDRANT_DISTANCE", default=DEFAULT_DISTANCE)
    ledger_path = args.ledger or default_wiki_publish_ledger_path(args.wikidb_root)

    try:
        config = WikiSourceConfig.from_path(args.wikidb_root)
        payload = WikiMarkdownExtractor(config=config).approved_payload()
        chunks, _ = dry_run_approved_payload(payload)
        document_plans = _build_document_plans(config=config, chunks=chunks)
        selected_documents = _selected_documents(args.document, wikidb_root=args.wikidb_root)
        _validate_selected_documents(selected_documents, document_plans)
        ledger = load_wiki_publish_ledger(ledger_path)

        stale_ledger_documents = sorted(set(ledger["documents"]) - set(document_plans))
        publish_plans: list[WikiDocumentPlan] = []
        skipped_current: list[str] = []
        skipped_changed: list[str] = []
        assumed_documents: list[str] = []

        for relative_path, plan in document_plans.items():
            is_selected = not selected_documents or relative_path in selected_documents
            if not is_selected:
                if args.assume_published_unselected and args.document and relative_path not in ledger["documents"]:
                    ledger["documents"][relative_path] = _ledger_entry(
                        plan,
                        status="assumed_published",
                        collection=collection,
                        embedding_model=embedding_model,
                        vector_dimension=vector_dimension,
                    )
                    assumed_documents.append(relative_path)
                continue

            entry = ledger["documents"].get(relative_path)
            if entry and not args.force:
                if ledger_entry_is_current(
                    entry,
                    file_digest=plan.file_sha1,
                    collection=collection,
                    embedding_model=embedding_model,
                    vector_dimension=vector_dimension,
                ):
                    skipped_current.append(relative_path)
                else:
                    skipped_changed.append(relative_path)
                continue
            publish_plans.append(plan)

        embedding_elapsed = 0.0
        upsert_elapsed = 0.0
        embedded_count = 0
        upserted_count = 0

        if publish_plans and not args.dry_run:
            provider = ConfiguredEmbeddingProvider()
            embedding_model = provider.model
            vector_dimension = provider.dimension
            selected_chunks = [chunk for plan in publish_plans for chunk in plan.chunks]

            embedding_started_at = perf_counter()
            vectors = _embed_chunks(provider, selected_chunks, batch_size=args.batch_size)
            embedding_elapsed = perf_counter() - embedding_started_at
            embedded_count = len(vectors)

            store = ConfiguredQdrantVectorStore(
                url=args.qdrant_url,
                collection_name=args.collection,
                vector_dimension=vector_dimension,
                distance=args.distance,
            )
            collection = store.collection_name

            upsert_started_at = perf_counter()
            upserted_count = _upsert_chunks(
                store,
                selected_chunks,
                vectors,
                batch_size=args.upsert_batch_size,
            )
            upsert_elapsed = perf_counter() - upsert_started_at

            for plan in publish_plans:
                ledger["documents"][plan.relative_path] = _ledger_entry(
                    plan,
                    status="published",
                    collection=collection,
                    embedding_model=embedding_model,
                    vector_dimension=vector_dimension,
                )

        ledger_changed = bool(assumed_documents) or (bool(publish_plans) and not args.dry_run)
        if ledger_changed and not args.dry_run:
            ledger["updated_at"] = _now_iso()
            save_wiki_publish_ledger(ledger_path, ledger)
    except (
        ValueError,
        IngestionValidationError,
        EmbeddingNotConfiguredError,
        EmbeddingProviderError,
        QdrantStoreError,
    ) as exc:
        print(f"RAG wiki publish failed: {exc}", file=sys.stderr)
        return 2

    summary = {
        "wikidb_root": str(args.wikidb_root),
        "wiki_dir": str(config.wiki_dir),
        "ledger": str(ledger_path),
        "collection": collection,
        "embedding_model": embedding_model,
        "vector_dimension": vector_dimension,
        "planned_documents_total": len(document_plans),
        "planned_chunks_total": len(chunks),
        "selected_documents": sorted(selected_documents) if selected_documents else "all",
        "documents_to_publish": [plan.relative_path for plan in publish_plans],
        "documents_to_assume_published": assumed_documents,
        "documents_published": [] if args.dry_run else [plan.relative_path for plan in publish_plans],
        "documents_assumed_published": assumed_documents if not args.dry_run else [],
        "skipped_current_documents": skipped_current,
        "skipped_changed_documents": skipped_changed,
        "stale_ledger_documents": stale_ledger_documents,
        "embedded_count": embedded_count,
        "upserted_count": upserted_count,
        "embedding_elapsed_seconds": round(embedding_elapsed, 2),
        "upsert_elapsed_seconds": round(upsert_elapsed, 2),
        "storage": "dry-run; not written" if args.dry_run else "written to Qdrant" if publish_plans else "no Qdrant writes needed",
    }
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        _print_summary(summary)
    return 0


def _build_document_plans(
    *,
    config: WikiSourceConfig,
    chunks: list[PlannedEmbeddingChunk],
) -> dict[str, WikiDocumentPlan]:
    chunks_by_document: dict[str, list[PlannedEmbeddingChunk]] = {}
    for chunk in chunks:
        source_locator = str(chunk.metadata.get("source_locator") or "")
        relative_path = source_locator.split("#", 1)[0]
        if not relative_path:
            raise IngestionValidationError(f"planned chunk has no source_locator: {chunk.id}")
        chunks_by_document.setdefault(relative_path, []).append(chunk)

    plans: dict[str, WikiDocumentPlan] = {}
    for relative_path, document_chunks in chunks_by_document.items():
        path = config.root / Path(relative_path)
        if not path.exists():
            raise IngestionValidationError(f"wiki document does not exist: {path}")
        plans[relative_path] = WikiDocumentPlan(
            relative_path=relative_path,
            path=path,
            file_sha1=file_sha1(path),
            chunks=document_chunks,
        )
    return dict(sorted(plans.items()))


def _selected_documents(values: list[str], *, wikidb_root: Path) -> set[str]:
    return {
        normalize_wiki_document_path(value, wikidb_root=wikidb_root)
        for value in values
    }


def _validate_selected_documents(selected_documents: set[str], document_plans: dict[str, WikiDocumentPlan]) -> None:
    missing = sorted(selected_documents - set(document_plans))
    if missing:
        raise ValueError(f"selected Wiki documents produced no chunks or do not exist: {', '.join(missing)}")


def _ledger_entry(
    plan: WikiDocumentPlan,
    *,
    status: str,
    collection: str,
    embedding_model: str,
    vector_dimension: int,
) -> dict[str, Any]:
    return {
        "status": status,
        "file_sha1": plan.file_sha1,
        "collection": collection,
        "embedding_model": embedding_model,
        "vector_dimension": vector_dimension,
        "published_at": _now_iso(),
        "chunk_count": len(plan.chunks),
        "point_ids": plan.point_ids,
        "source_locators": plan.source_locators,
    }


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
    upserted_count = 0
    for start in range(0, len(chunks), batch_size):
        chunk_batch = chunks[start : start + batch_size]
        vector_batch = vectors[start : start + batch_size]
        upserted_count += store.upsert_embedding_chunks(chunk_batch, vector_batch)
    return upserted_count


def _print_summary(summary: dict[str, Any]) -> None:
    print("RAG wiki publish")
    for key, value in summary.items():
        if isinstance(value, list):
            print(f"{key}: {len(value)}")
            for item in value:
                print(f"  - {item}")
        else:
            print(f"{key}: {value}")


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _env(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip():
            return value.strip()
    return default


def _load_dotenv_files() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    load_dotenv(BACKEND_ROOT / ".env", override=False)


if __name__ == "__main__":
    raise SystemExit(main())
