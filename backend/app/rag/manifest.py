from __future__ import annotations

from dataclasses import asdict, dataclass, field
from hashlib import sha1
import json
import os
from pathlib import Path
import re
from typing import Any

from .ingestion import PlannedEmbeddingChunk, dry_run_approved_payload
from .sources.wiki.config import WikiSourceConfig
from .sources.wiki.extractor import WikiMarkdownExtractor


WIKI_PARSER_VERSION = "wiki-markdown-v1"
DEFAULT_VISIBILITY = "public"
ACTIVE_STATUS = "active"
IDENTIFIER_RE = re.compile(r"[A-Za-z][A-Za-z0-9_.:/-]{1,}|[A-Z]{2,}\d*|\d+(?:\.\d+){1,}")


@dataclass(slots=True)
class ChunkManifest:
    doc_id: str
    doc_version: str
    chunk_id: str
    chunk_index: int
    chunk_ref: str
    content: str
    normalized_content: str
    content_hash: str
    source_path: str
    source_locator: str
    title: str
    heading_path: list[str]
    chunk_type: str
    acl: dict[str, Any] = field(default_factory=dict)
    visibility: str = DEFAULT_VISIBILITY
    status: str = ACTIVE_STATUS
    parser_version: str = WIKI_PARSER_VERSION
    created_at: str = ""
    updated_at: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_payload(self) -> dict[str, Any]:
        payload = asdict(self)
        if not payload.get("created_at"):
            payload.pop("created_at", None)
        if not payload.get("updated_at"):
            payload.pop("updated_at", None)
        payload["identifiers"] = extract_identifiers(
            " ".join([self.title, self.source_locator, *self.heading_path, self.normalized_content])
        )
        payload["agent_scope"] = _list(self.metadata.get("agent_scope"))
        payload["process_areas"] = _list(self.metadata.get("process_areas"))
        payload["device_ids"] = _list(self.metadata.get("device_ids"))
        payload["incident_types"] = _list(self.metadata.get("incident_types"))
        payload["knowledge_type"] = self.metadata.get("knowledge_type") or "process_doc"
        payload["source"] = self.metadata.get("source") or f"wikidb:{self.doc_id}"
        payload["source_version"] = self.metadata.get("source_version")
        payload["safety_level"] = self.metadata.get("safety_level")
        payload["effective_time"] = self.metadata.get("effective_time")
        payload["display_text"] = self.content
        payload["text_for_embedding"] = self.embedding_text
        payload["section_path"] = self.heading_path
        payload["block_kind"] = self.metadata.get("block_kind")
        return payload

    @property
    def embedding_text(self) -> str:
        if not self.heading_path:
            return self.normalized_content
        return f"{' / '.join(self.heading_path)}\n{self.normalized_content}"

    def to_planned_embedding_chunk(self) -> PlannedEmbeddingChunk:
        return PlannedEmbeddingChunk(
            id=self.chunk_id,
            chunk_type=self.chunk_type,
            text_for_embedding=self.embedding_text,
            display_text=self.content,
            metadata=self.to_payload(),
            char_count=len(self.embedding_text),
        )


@dataclass(slots=True)
class DocumentManifest:
    doc_id: str
    source_path: str
    source_hash: str
    acl_hash: str
    doc_version: str
    chunks: list[ChunkManifest]
    status: str = ACTIVE_STATUS


def build_wiki_document_manifests(config: WikiSourceConfig) -> dict[str, DocumentManifest]:
    _load_dotenv_files()
    default_acl = default_acl_config()
    payload = WikiMarkdownExtractor(config=config).approved_payload()
    planned_chunks, _ = dry_run_approved_payload(payload)
    source_hashes = _wiki_source_hashes(config)
    acl_hash = stable_hash(default_acl)
    chunks_by_doc: dict[str, list[PlannedEmbeddingChunk]] = {}
    for chunk in planned_chunks:
        doc_id = _doc_id_from_locator(str(chunk.metadata.get("source_locator") or ""))
        if not doc_id:
            continue
        chunks_by_doc.setdefault(doc_id, []).append(chunk)

    documents: dict[str, DocumentManifest] = {}
    for doc_id, document_chunks in sorted(chunks_by_doc.items()):
        source_hash = source_hashes.get(doc_id, "")
        doc_version = stable_hash(
            {
                "doc_id": doc_id,
                "source_hash": source_hash,
                "acl_hash": acl_hash,
                "parser_version": WIKI_PARSER_VERSION,
            }
        )
        manifests: list[ChunkManifest] = []
        for index, chunk in enumerate(document_chunks, start=1):
            normalized = normalize_content(chunk.display_text)
            heading_path = _list(chunk.metadata.get("section_path"))
            chunk_ref = _chunk_ref(chunk, index=index, heading_path=heading_path)
            chunk_id = stable_hash(
                {
                    "doc_id": doc_id,
                    "doc_version": doc_version,
                    "chunk_ref": chunk_ref,
                }
            )
            manifests.append(
                ChunkManifest(
                    doc_id=doc_id,
                    doc_version=doc_version,
                    chunk_id=chunk_id,
                    chunk_index=index,
                    chunk_ref=chunk_ref,
                    content=chunk.display_text,
                    normalized_content=normalized,
                    content_hash=stable_hash(normalized),
                    source_path=doc_id,
                    source_locator=str(chunk.metadata.get("source_locator") or ""),
                    title=str(chunk.metadata.get("title") or ""),
                    heading_path=heading_path,
                    chunk_type=chunk.chunk_type,
                    acl={"roles": default_acl["roles"], "tenant": default_acl["tenant"]},
                    visibility=str(default_acl["visibility"]),
                    status=ACTIVE_STATUS,
                    parser_version=WIKI_PARSER_VERSION,
                    metadata=dict(chunk.metadata),
                )
            )
        documents[doc_id] = DocumentManifest(
            doc_id=doc_id,
            source_path=doc_id,
            source_hash=source_hash,
            acl_hash=acl_hash,
            doc_version=doc_version,
            chunks=manifests,
        )
    return documents


def default_acl_config() -> dict[str, Any]:
    return {
        "roles": _csv_env("RAG_DEFAULT_ROLES"),
        "tenant": _env("RAG_DEFAULT_TENANT"),
        "visibility": _env("RAG_DEFAULT_VISIBILITY", default=DEFAULT_VISIBILITY),
    }


def normalize_content(value: str) -> str:
    return "\n".join(line.strip() for line in value.strip().splitlines() if line.strip())


def stable_hash(value: Any) -> str:
    if isinstance(value, str):
        raw = value
    else:
        raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha1(raw.encode("utf-8")).hexdigest()


def file_sha1(path: Path) -> str:
    digest = sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_identifiers(text: str) -> list[str]:
    values = [match.group(0) for match in IDENTIFIER_RE.finditer(text)]
    return sorted(set(values), key=values.index)


def _wiki_source_hashes(config: WikiSourceConfig) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for path in sorted(config.wiki_dir.rglob("*.md")):
        if path.name.startswith("."):
            continue
        doc_id = path.relative_to(config.root).as_posix()
        hashes[doc_id] = file_sha1(path)
    return hashes


def _doc_id_from_locator(locator: str) -> str:
    return locator.split("#", 1)[0].strip()


def _chunk_ref(chunk: PlannedEmbeddingChunk, *, index: int, heading_path: list[str]) -> str:
    locator = str(chunk.metadata.get("source_locator") or "")
    fragment = locator.split("#", 1)[1] if "#" in locator else f"chunk-{index}"
    heading = "/".join(heading_path) or "root"
    return f"{heading}#{fragment}"


def _list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item).strip()]


def _csv_env(name: str) -> list[str]:
    value = os.getenv(name, "").strip()
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _env(name: str, *, default: str = "") -> str:
    value = os.getenv(name)
    if value is not None and value.strip():
        return value.strip()
    return default


def _load_dotenv_files() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    backend_root = Path(__file__).resolve().parents[2]
    project_root = backend_root.parent
    load_dotenv(project_root / ".env", override=False)
    load_dotenv(backend_root / ".env", override=False)
