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
import uuid


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if not (BACKEND_ROOT / "app").exists():
    BACKEND_ROOT = PROJECT_ROOT
DEFAULT_WIKIDB_ROOT = PROJECT_ROOT.parent / "wikidb" / "wikidb"
sys.path.insert(0, str(BACKEND_ROOT))

from app.rag.elasticsearch_store import ConfiguredElasticsearchChunkStore, ElasticsearchStoreError
from app.rag.embeddings import ConfiguredEmbeddingProvider, EmbeddingNotConfiguredError, EmbeddingProviderError
from app.rag.manifest import DocumentManifest, build_wiki_document_manifests
from app.rag.qdrant_store import ConfiguredQdrantVectorStore, QdrantStoreError
from app.rag.sources.wiki.config import WikiSourceConfig
from app.rag.state_store import ConfiguredRagIndexStateStore, IndexRunSummary


@dataclass(slots=True)
class SyncPlan:
    added: list[str]
    modified: list[str]
    missing: list[str]
    skipped: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Synchronize wikidb/wiki Markdown into ES + Qdrant RAG indexes.")
    parser.add_argument("--wikidb-root", type=Path, default=_default_wikidb_root())
    parser.add_argument("--doc", action="append", default=[], help="Only process the selected wiki document path.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--delete-missing", action="store_true")
    parser.add_argument("--check", action="store_true", help="Compare Wiki manifest, SQL state, ES, and Qdrant.")
    parser.add_argument("--state-only", action="store_true", help="With --check, skip ES/Qdrant consistency checks.")
    parser.add_argument("--check-sample-size", type=int, default=1000)
    parser.add_argument("--rebuild", action="store_true", help="Treat all current documents as modified.")
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.batch_size <= 0:
        print("--batch-size must be greater than 0", file=sys.stderr)
        return 2

    started_at = perf_counter()
    run_id = str(uuid.uuid4())
    started_iso = _now_iso()
    errors: list[dict[str, Any]] = []
    written_es = 0
    written_qdrant = 0
    deleted_es = 0
    deleted_qdrant = 0

    try:
        config = WikiSourceConfig.from_path(args.wikidb_root)
        current = build_wiki_document_manifests(config)
        current = _select_documents(current, args.doc)
        state = ConfiguredRagIndexStateStore()
        if not args.dry_run:
            state.init_schema()
        elif args.check:
            state.init_schema()
        previous = state.load_documents() if not args.dry_run or args.check else {}
        plan = build_sync_plan(current, previous, rebuild=args.rebuild)
        consistency: dict[str, Any] = {}

        if args.check:
            state_chunks = state.load_chunks()
            consistency = build_consistency_report(
                current=current,
                previous=previous,
                state_chunks=state_chunks,
                sample_size=args.check_sample_size,
                include_storage=not args.state_only,
            )
            errors.extend(consistency.get("errors", []))
            if not consistency.get("consistent"):
                errors.append({"target": "consistency", "error": "RAG indexes are not consistent with the Wiki manifest."})

        if not args.dry_run and not args.check:
            es_store = ConfiguredElasticsearchChunkStore()
            qdrant_store = ConfiguredQdrantVectorStore()
            provider = ConfiguredEmbeddingProvider()

            for doc_id in [*plan.added, *plan.modified]:
                document = current[doc_id]
                try:
                    es_store.delete_doc_chunks(doc_id)
                    qdrant_store.delete_doc_chunks(doc_id)
                    vectors = _embed_document(provider, document, batch_size=args.batch_size)
                    written_es += es_store.upsert_chunks(document.chunks)
                    written_qdrant += qdrant_store.upsert_embedding_chunks(
                        [chunk.to_planned_embedding_chunk() for chunk in document.chunks],
                        vectors,
                    )
                    indexed_at = _now_iso()
                    state.upsert_document(document, seen_at=indexed_at, indexed_at=indexed_at)
                    state.replace_document_chunks(document)
                except (EmbeddingProviderError, ElasticsearchStoreError, QdrantStoreError) as exc:
                    errors.append({"doc_id": doc_id, "target": "sync", "error": str(exc)})
                    state.record_error(run_id=run_id, target="sync", doc_id=doc_id, error_message=str(exc))

            seen_at = _now_iso()
            for doc_id in plan.skipped:
                state.upsert_document(current[doc_id], seen_at=seen_at, indexed_at=None)

            if args.delete_missing:
                for doc_id in plan.missing:
                    try:
                        deleted_es += es_store.delete_doc_chunks(doc_id)
                        deleted_qdrant += qdrant_store.delete_doc_chunks(doc_id)
                        state.mark_document_deleted(doc_id, seen_at=_now_iso())
                    except (ElasticsearchStoreError, QdrantStoreError) as exc:
                        errors.append({"doc_id": doc_id, "target": "delete", "error": str(exc)})
                        state.record_error(run_id=run_id, target="delete", doc_id=doc_id, error_message=str(exc))

            state.record_run(
                IndexRunSummary(
                    run_id=run_id,
                    started_at=started_iso,
                    ended_at=_now_iso(),
                    mode=_run_mode(args),
                    status="failed" if errors else "success",
                    added_docs=len(plan.added),
                    modified_docs=len(plan.modified),
                    deleted_docs=len(plan.missing) if args.delete_missing else 0,
                    skipped_docs=len(plan.skipped),
                    failed_docs=len(errors),
                )
            )
    except (
        ValueError,
        EmbeddingNotConfiguredError,
        ElasticsearchStoreError,
        QdrantStoreError,
    ) as exc:
        print(f"RAG index sync failed: {exc}", file=sys.stderr)
        return 2

    elapsed_seconds = perf_counter() - started_at
    summary = {
        "run_id": run_id,
        "mode": _run_mode(args),
        "wikidb_root": str(args.wikidb_root),
        "selected_documents": args.doc or "all",
        "planned_documents_total": len(current),
        "planned_chunks_total": sum(len(document.chunks) for document in current.values()),
        "added_documents": plan.added,
        "modified_documents": plan.modified,
        "missing_documents": plan.missing,
        "skipped_documents": plan.skipped,
        "delete_missing_enabled": args.delete_missing,
        "written_es_chunks": written_es,
        "written_qdrant_chunks": written_qdrant,
        "deleted_es_chunks": deleted_es,
        "deleted_qdrant_chunks": deleted_qdrant,
        "errors": errors,
        "consistency": consistency,
        "elapsed_seconds": round(elapsed_seconds, 2),
        "storage": "not written" if args.dry_run or args.check else "written",
    }
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        _print_summary(summary)
    return 2 if errors else 0


def build_sync_plan(
    current: dict[str, DocumentManifest],
    previous: dict[str, Any],
    *,
    rebuild: bool = False,
) -> SyncPlan:
    current_ids = set(current)
    previous_ids = {doc_id for doc_id, doc in previous.items() if getattr(doc, "status", "") != "deleted"}
    added = sorted(current_ids - previous_ids)
    missing = sorted(previous_ids - current_ids)
    modified: list[str] = []
    skipped: list[str] = []
    for doc_id in sorted(current_ids & previous_ids):
        if rebuild or previous[doc_id].doc_version != current[doc_id].doc_version:
            modified.append(doc_id)
        else:
            skipped.append(doc_id)
    if rebuild:
        modified = sorted(current_ids)
        added = []
        skipped = []
    return SyncPlan(added=added, modified=modified, missing=missing, skipped=skipped)


def build_consistency_report(
    *,
    current: dict[str, DocumentManifest],
    previous: dict[str, Any],
    state_chunks: dict[str, Any],
    sample_size: int,
    include_storage: bool,
) -> dict[str, Any]:
    expected_chunks = _current_chunks(current)
    active_state_docs = {doc_id: doc for doc_id, doc in previous.items() if getattr(doc, "status", "") == "active"}
    active_state_chunks = {
        chunk_id: chunk for chunk_id, chunk in state_chunks.items() if getattr(chunk, "status", "") == "active"
    }
    report: dict[str, Any] = {
        "expected_document_count": len(current),
        "expected_chunk_count": len(expected_chunks),
        "state_active_document_count": len(active_state_docs),
        "state_active_chunk_count": len(active_state_chunks),
        "state_missing_chunk_count": len(set(expected_chunks) - set(active_state_chunks)),
        "state_extra_chunk_count": len(set(active_state_chunks) - set(expected_chunks)),
        "state_hash_mismatch_count": 0,
        "sample_size": max(0, sample_size),
        "sampled_chunk_count": 0,
        "storage_checked": include_storage,
        "errors": [],
    }

    for chunk_id, chunk in expected_chunks.items():
        state_chunk = active_state_chunks.get(chunk_id)
        if state_chunk is not None and getattr(state_chunk, "content_hash", "") != chunk.content_hash:
            report["state_hash_mismatch_count"] += 1

    sample_ids = sorted(expected_chunks)[: max(0, sample_size)]
    report["sampled_chunk_count"] = len(sample_ids)
    if include_storage:
        _merge_storage_report(report, "elasticsearch", _check_elasticsearch(expected_chunks, sample_ids))
        _merge_storage_report(report, "qdrant", _check_qdrant(expected_chunks, sample_ids))

    report["consistent"] = (
        report["state_active_document_count"] == report["expected_document_count"]
        and report["state_active_chunk_count"] == report["expected_chunk_count"]
        and report["state_missing_chunk_count"] == 0
        and report["state_extra_chunk_count"] == 0
        and report["state_hash_mismatch_count"] == 0
        and not report["errors"]
        and all(value.get("consistent", True) for key, value in report.items() if key in {"elasticsearch", "qdrant"})
    )
    return report


def _check_elasticsearch(expected_chunks: dict[str, Any], sample_ids: list[str]) -> dict[str, Any]:
    try:
        store = ConfiguredElasticsearchChunkStore()
        count = store.count_chunks()
        payloads = store.fetch_chunk_payloads(sample_ids)
        return _storage_payload_report(expected_chunks, sample_ids, payloads, count)
    except ElasticsearchStoreError as exc:
        return {"available": False, "consistent": False, "error": str(exc)}


def _check_qdrant(expected_chunks: dict[str, Any], sample_ids: list[str]) -> dict[str, Any]:
    try:
        store = ConfiguredQdrantVectorStore()
        count = store.count_chunks()
        payloads = store.fetch_chunk_payloads(sample_ids)
        return _storage_payload_report(expected_chunks, sample_ids, payloads, count)
    except QdrantStoreError as exc:
        return {"available": False, "consistent": False, "error": str(exc)}


def _storage_payload_report(
    expected_chunks: dict[str, Any],
    sample_ids: list[str],
    payloads: dict[str, dict[str, Any]],
    count: int,
) -> dict[str, Any]:
    missing = sorted(set(sample_ids) - set(payloads))
    hash_mismatches = []
    for chunk_id in sorted(set(sample_ids) & set(payloads)):
        expected_hash = expected_chunks[chunk_id].content_hash
        actual_hash = str(payloads[chunk_id].get("content_hash") or "")
        if expected_hash != actual_hash:
            hash_mismatches.append(chunk_id)
    return {
        "available": True,
        "active_chunk_count": count,
        "sample_missing_count": len(missing),
        "sample_hash_mismatch_count": len(hash_mismatches),
        "sample_missing": missing[:20],
        "sample_hash_mismatches": hash_mismatches[:20],
        "consistent": count == len(expected_chunks) and not missing and not hash_mismatches,
    }


def _merge_storage_report(report: dict[str, Any], name: str, storage_report: dict[str, Any]) -> None:
    report[name] = storage_report
    if storage_report.get("error"):
        report["errors"].append({"target": name, "error": storage_report["error"]})


def _current_chunks(current: dict[str, DocumentManifest]) -> dict[str, Any]:
    return {
        chunk.chunk_id: chunk
        for document in current.values()
        for chunk in document.chunks
        if chunk.status == "active"
    }


def _select_documents(documents: dict[str, DocumentManifest], values: list[str]) -> dict[str, DocumentManifest]:
    if not values:
        return documents
    selected = {_normalize_doc_value(value) for value in values}
    missing = sorted(selected - set(documents))
    if missing:
        raise ValueError(f"selected Wiki documents produced no chunks or do not exist: {', '.join(missing)}")
    return {doc_id: documents[doc_id] for doc_id in sorted(selected)}


def _normalize_doc_value(value: str) -> str:
    normalized = value.replace("\\", "/").strip()
    if not normalized.startswith("wiki/"):
        normalized = f"wiki/{normalized}"
    return normalized


def _embed_document(
    provider: ConfiguredEmbeddingProvider,
    document: DocumentManifest,
    *,
    batch_size: int,
) -> list[list[float]]:
    chunks = [chunk.to_planned_embedding_chunk() for chunk in document.chunks]
    vectors: list[list[float]] = []
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        vectors.extend(provider.embed_texts([chunk.text_for_embedding for chunk in batch]))
    return vectors


def _run_mode(args: argparse.Namespace) -> str:
    if args.check:
        return "check"
    if args.rebuild:
        return "rebuild"
    if args.dry_run:
        return "dry-run"
    return "sync"


def _print_summary(summary: dict[str, Any]) -> None:
    print("RAG index sync")
    for key, value in summary.items():
        if isinstance(value, list):
            print(f"{key}: {len(value)}")
            for item in value:
                print(f"  - {item}")
        else:
            print(f"{key}: {value}")


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _default_wikidb_root() -> Path:
    configured = os.getenv("RAG_WIKIDB_ROOT", "").strip()
    return Path(configured) if configured else DEFAULT_WIKIDB_ROOT


if __name__ == "__main__":
    raise SystemExit(main())
