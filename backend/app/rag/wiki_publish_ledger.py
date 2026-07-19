from __future__ import annotations

from hashlib import sha1
import json
from pathlib import Path
from typing import Any


LEDGER_VERSION = 1
DEFAULT_LEDGER_NAME = ".qdrant_published.json"


def default_wiki_publish_ledger_path(wikidb_root: Path) -> Path:
    return wikidb_root / "wiki" / DEFAULT_LEDGER_NAME


def file_sha1(path: Path) -> str:
    digest = sha1()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_wiki_publish_ledger(path: Path) -> dict[str, Any]:
    if not path.exists():
        return new_wiki_publish_ledger()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid Qdrant publish ledger JSON: {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"Qdrant publish ledger must be a JSON object: {path}")
    documents = payload.get("documents")
    if documents is None:
        payload["documents"] = {}
    elif not isinstance(documents, dict):
        raise ValueError(f"Qdrant publish ledger documents must be an object: {path}")
    payload.setdefault("version", LEDGER_VERSION)
    return payload


def new_wiki_publish_ledger() -> dict[str, Any]:
    return {
        "version": LEDGER_VERSION,
        "documents": {},
    }


def save_wiki_publish_ledger(path: Path, ledger: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_wiki_document_path(value: str | Path, *, wikidb_root: Path) -> str:
    raw = Path(value)
    wiki_dir = wikidb_root / "wiki"
    if raw.is_absolute():
        try:
            return raw.resolve().relative_to(wikidb_root.resolve()).as_posix()
        except ValueError as exc:
            raise ValueError(f"document is not under wikidb root: {raw}") from exc

    normalized = raw.as_posix().replace("\\", "/").strip("/")
    if not normalized:
        raise ValueError("document path must not be empty")
    if normalized.startswith("wiki/"):
        return normalized
    if (wiki_dir / normalized).suffix.lower() == ".md":
        return f"wiki/{normalized}"
    return normalized


def ledger_entry_is_current(
    entry: dict[str, Any],
    *,
    file_digest: str,
    collection: str,
    embedding_model: str,
    vector_dimension: int,
) -> bool:
    if entry.get("file_sha1") != file_digest:
        return False
    if entry.get("collection") and entry.get("collection") != collection:
        return False
    if entry.get("embedding_model") and entry.get("embedding_model") != embedding_model:
        return False
    if entry.get("vector_dimension") and int(entry.get("vector_dimension") or 0) != vector_dimension:
        return False
    return True
