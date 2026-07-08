from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from hashlib import sha1
import json
from pathlib import Path
from typing import Any

from .chunker import SimpleTextChunker
from .interfaces import Chunker, EmbeddingProvider, VectorStore
from .schemas import KnowledgeChunk


APPROVED_STATUS = "approved"
CONTENT_CHUNK = "content_chunk"
DEFAULT_SHORT_TEXT_THRESHOLD = 20
DEFAULT_LONG_TEXT_THRESHOLD = 1200


class IngestionValidationError(ValueError):
    """Raised when an approved knowledge file is not safe to publish."""


@dataclass(slots=True)
class PlannedEmbeddingChunk:
    """A side-effect-free embedding unit planned from an approved review block."""

    id: str
    chunk_type: str
    text_for_embedding: str
    display_text: str
    metadata: dict[str, Any]
    char_count: int


@dataclass(slots=True)
class IngestionDryRunReport:
    """Summary of what ingestion would do without calling embeddings or Qdrant."""

    source: str | None
    input_path: str | None
    approved_block_count: int
    planned_chunk_count: int
    skipped_count: int
    by_block_kind: dict[str, int]
    by_knowledge_type: dict[str, int]
    empty_section_path_count: int
    short_text_count: int
    long_text_count: int
    warnings: list[str]
    longest_chunks: list[dict[str, Any]]
    shortest_chunks: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class KnowledgeIngestionPipeline:
    """Coordinates chunking, embedding, and vector-store writes."""

    def __init__(
        self,
        *,
        chunker: Chunker | None = None,
        embedding_provider: EmbeddingProvider | None = None,
        vector_store: VectorStore | None = None,
    ) -> None:
        self.chunker = chunker or SimpleTextChunker()
        self.embedding_provider = embedding_provider
        self.vector_store = vector_store

    def ingest_text(self, text: str, *, source: str) -> Sequence[KnowledgeChunk]:
        chunks = list(self.chunker.split_text(text, source=source))
        if not chunks:
            return []
        if self.embedding_provider is None or self.vector_store is None:
            raise NotImplementedError("RAG ingestion storage is not wired yet.")

        vectors = self.embedding_provider.embed_texts([chunk.text for chunk in chunks])
        self.vector_store.upsert_chunks(chunks, vectors)
        return chunks


def load_approved_payload(path: str | Path) -> dict[str, Any]:
    source_path = Path(path)
    if not source_path.exists():
        raise IngestionValidationError(f"approved file does not exist: {source_path}")
    try:
        payload = json.loads(source_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise IngestionValidationError(f"invalid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise IngestionValidationError("approved JSON must be an object")
    return payload


def validate_approved_payload(payload: dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        raise IngestionValidationError("approved JSON must be an object")
    if payload.get("status") != APPROVED_STATUS:
        raise IngestionValidationError(f"top-level status must be {APPROVED_STATUS!r}")

    blocks = payload.get("blocks")
    if not isinstance(blocks, list):
        raise IngestionValidationError("approved JSON must contain a blocks list")

    seen_ids: set[str] = set()
    seen_locators: set[str] = set()
    for index, block in enumerate(blocks, start=1):
        if not isinstance(block, dict):
            raise IngestionValidationError(f"block {index} must be an object")
        if block.get("status") != APPROVED_STATUS:
            raise IngestionValidationError(f"block {index} status must be {APPROVED_STATUS!r}")

        block_id = _required_string(block, "id", index)
        if block_id in seen_ids:
            raise IngestionValidationError(f"duplicate block id: {block_id}")
        seen_ids.add(block_id)

        text = _required_string(block, "text", index)
        if not text.strip():
            raise IngestionValidationError(f"block {index} text must not be empty")

        source_locator = _required_string(block, "source_locator", index)
        if source_locator in seen_locators:
            raise IngestionValidationError(f"duplicate source_locator: {source_locator}")
        seen_locators.add(source_locator)

        metadata = block.get("metadata")
        if not isinstance(metadata, dict):
            raise IngestionValidationError(f"block {index} metadata must be an object")
        _required_string(metadata, "source", index, parent="metadata")
        _required_string(metadata, "knowledge_type", index, parent="metadata")

        char_count = block.get("char_count")
        if not isinstance(char_count, int):
            raise IngestionValidationError(f"block {index} char_count must be an integer")
        if char_count != len(text):
            raise IngestionValidationError(f"block {index} char_count does not match text length")


def plan_embedding_chunks(payload: dict[str, Any]) -> list[PlannedEmbeddingChunk]:
    validate_approved_payload(payload)
    planned: list[PlannedEmbeddingChunk] = []
    for index, block in enumerate(payload["blocks"], start=1):
        text = block["text"].strip()
        section_path = _section_path(block)
        text_for_embedding = _text_for_embedding(section_path, text)
        metadata = _chunk_metadata(block, index=index)
        chunk_id = sha1(
            f"{block['id']}:{block['source_locator']}:{CONTENT_CHUNK}".encode("utf-8")
        ).hexdigest()
        planned.append(
            PlannedEmbeddingChunk(
                id=chunk_id,
                chunk_type=CONTENT_CHUNK,
                text_for_embedding=text_for_embedding,
                display_text=text,
                metadata=metadata,
                char_count=len(text_for_embedding),
            )
        )
    return planned


def dry_run_approved_payload(
    payload: dict[str, Any],
    *,
    short_text_threshold: int = DEFAULT_SHORT_TEXT_THRESHOLD,
    long_text_threshold: int = DEFAULT_LONG_TEXT_THRESHOLD,
    sample_size: int = 10,
) -> tuple[list[PlannedEmbeddingChunk], IngestionDryRunReport]:
    chunks = plan_embedding_chunks(payload)
    blocks = payload["blocks"]
    by_block_kind = Counter(
        str(_metadata_extra(block).get("block_kind") or "unknown")
        for block in blocks
    )
    by_knowledge_type = Counter(
        str((block.get("metadata") or {}).get("knowledge_type") or "unknown")
        for block in blocks
    )
    empty_section_path_count = sum(1 for block in blocks if not _section_path(block))
    short_text_count = sum(1 for block in blocks if len(str(block.get("text", ""))) <= short_text_threshold)
    long_text_count = sum(1 for chunk in chunks if chunk.char_count > long_text_threshold)
    warnings = _dry_run_warnings(
        empty_section_path_count=empty_section_path_count,
        short_text_count=short_text_count,
        long_text_count=long_text_count,
    )
    sorted_by_length = sorted(chunks, key=lambda chunk: chunk.char_count)
    report = IngestionDryRunReport(
        source=payload.get("source"),
        input_path=payload.get("input_path"),
        approved_block_count=len(blocks),
        planned_chunk_count=len(chunks),
        skipped_count=0,
        by_block_kind=dict(sorted(by_block_kind.items())),
        by_knowledge_type=dict(sorted(by_knowledge_type.items())),
        empty_section_path_count=empty_section_path_count,
        short_text_count=short_text_count,
        long_text_count=long_text_count,
        warnings=warnings,
        longest_chunks=[_chunk_sample(chunk) for chunk in sorted_by_length[-sample_size:][::-1]],
        shortest_chunks=[_chunk_sample(chunk) for chunk in sorted_by_length[:sample_size]],
    )
    return chunks, report


def dry_run_approved_file(
    path: str | Path,
    *,
    short_text_threshold: int = DEFAULT_SHORT_TEXT_THRESHOLD,
    long_text_threshold: int = DEFAULT_LONG_TEXT_THRESHOLD,
    sample_size: int = 10,
) -> tuple[list[PlannedEmbeddingChunk], IngestionDryRunReport]:
    payload = load_approved_payload(path)
    return dry_run_approved_payload(
        payload,
        short_text_threshold=short_text_threshold,
        long_text_threshold=long_text_threshold,
        sample_size=sample_size,
    )


def _required_string(
    mapping: dict[str, Any],
    key: str,
    block_index: int,
    *,
    parent: str = "block",
) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise IngestionValidationError(f"block {block_index} {parent}.{key} must be a non-empty string")
    return value


def _section_path(block: dict[str, Any]) -> list[str]:
    section_path = block.get("section_path")
    if not isinstance(section_path, list):
        return []
    return [str(part) for part in section_path if str(part).strip()]


def _text_for_embedding(section_path: list[str], text: str) -> str:
    if not section_path:
        return text
    return f"{' / '.join(section_path)}\n{text}"


def _chunk_metadata(block: dict[str, Any], *, index: int) -> dict[str, Any]:
    metadata = block["metadata"]
    extra = _metadata_extra(block)
    return {
        "approved_block_id": block["id"],
        "source": metadata.get("source"),
        "knowledge_type": metadata.get("knowledge_type"),
        "agent_scope": list(metadata.get("agent_scope") or []),
        "process_areas": list(metadata.get("process_areas") or []),
        "device_ids": list(metadata.get("device_ids") or []),
        "incident_types": list(metadata.get("incident_types") or []),
        "source_version": metadata.get("source_version"),
        "safety_level": metadata.get("safety_level"),
        "effective_time": metadata.get("effective_time"),
        "title": block.get("title"),
        "section_path": _section_path(block),
        "source_locator": block.get("source_locator"),
        "block_index": index,
        "block_kind": extra.get("block_kind"),
        "reviewed_by": extra.get("reviewed_by"),
        "reviewed_at": extra.get("reviewed_at"),
        "review_mode": extra.get("review_mode"),
        "review_action": extra.get("review_action"),
        "review_note": extra.get("review_note"),
    }


def _metadata_extra(block: dict[str, Any]) -> dict[str, Any]:
    metadata = block.get("metadata")
    if not isinstance(metadata, dict):
        return {}
    extra = metadata.get("extra")
    return extra if isinstance(extra, dict) else {}


def _dry_run_warnings(
    *,
    empty_section_path_count: int,
    short_text_count: int,
    long_text_count: int,
) -> list[str]:
    warnings: list[str] = []
    if empty_section_path_count:
        warnings.append(f"{empty_section_path_count} blocks have empty section_path")
    if short_text_count:
        warnings.append(f"{short_text_count} blocks are short text candidates")
    if long_text_count:
        warnings.append(f"{long_text_count} planned chunks exceed the long text threshold")
    return warnings


def _chunk_sample(chunk: PlannedEmbeddingChunk) -> dict[str, Any]:
    preview = chunk.display_text.replace("\n", " ")
    if len(preview) > 120:
        preview = f"{preview[:117]}..."
    return {
        "id": chunk.id,
        "char_count": chunk.char_count,
        "approved_block_id": chunk.metadata.get("approved_block_id"),
        "source_locator": chunk.metadata.get("source_locator"),
        "section_path": chunk.metadata.get("section_path"),
        "preview": preview,
    }
