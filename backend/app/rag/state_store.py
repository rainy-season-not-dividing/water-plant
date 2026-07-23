from __future__ import annotations

from dataclasses import dataclass
from contextlib import contextmanager
import json
import os
from pathlib import Path
import sqlite3
from typing import Any, Iterator, Protocol
from urllib.parse import urlparse

from .manifest import ACTIVE_STATUS, ChunkManifest, DocumentManifest


DEFAULT_POSTGRES_URL = "postgresql://water_plant:change-me@127.0.0.1:5432/water_plant"
DEFAULT_SQLITE_PATH = Path(__file__).resolve().parents[2] / "data" / "rag_index" / "rag_index_state.sqlite"


@dataclass(slots=True)
class IndexedDocument:
    doc_id: str
    source_path: str
    source_hash: str
    acl_hash: str
    doc_version: str
    status: str
    last_seen_at: str
    last_indexed_at: str | None


@dataclass(slots=True)
class IndexedChunk:
    chunk_id: str
    doc_id: str
    doc_version: str
    chunk_index: int
    chunk_ref: str
    content_hash: str
    status: str


@dataclass(slots=True)
class IndexRunSummary:
    run_id: str
    started_at: str
    ended_at: str
    mode: str
    status: str
    added_docs: int = 0
    modified_docs: int = 0
    deleted_docs: int = 0
    skipped_docs: int = 0
    failed_docs: int = 0


class RagIndexStateStore(Protocol):
    def init_schema(self) -> None:
        ...

    def load_documents(self) -> dict[str, IndexedDocument]:
        ...

    def load_chunks(self) -> dict[str, IndexedChunk]:
        ...

    def upsert_document(self, document: DocumentManifest, *, seen_at: str, indexed_at: str | None) -> None:
        ...

    def replace_document_chunks(self, document: DocumentManifest) -> None:
        ...

    def mark_document_deleted(self, doc_id: str, *, seen_at: str | None = None) -> None:
        ...

    def record_run(self, summary: IndexRunSummary) -> None:
        ...

    def record_error(
        self,
        *,
        run_id: str,
        target: str,
        doc_id: str | None = None,
        chunk_id: str | None = None,
        error_message: str,
    ) -> None:
        ...


class SqliteRagIndexStateStore:
    def __init__(self, path: str | Path = DEFAULT_SQLITE_PATH) -> None:
        self.path = Path(path)

    def init_schema(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as conn:
            for statement in SQLITE_SCHEMA:
                conn.execute(statement)

    def load_documents(self) -> dict[str, IndexedDocument]:
        with self._connection() as conn:
            rows = conn.execute(
                """
                SELECT doc_id, source_path, source_hash, acl_hash, doc_version, status,
                       last_seen_at, last_indexed_at
                FROM rag_documents
                """
            ).fetchall()
        return {str(row["doc_id"]): _indexed_document_from_row(row) for row in rows}

    def load_chunks(self) -> dict[str, IndexedChunk]:
        with self._connection() as conn:
            rows = conn.execute(
                """
                SELECT chunk_id, doc_id, doc_version, chunk_index, chunk_ref, content_hash, status
                FROM rag_chunks
                """
            ).fetchall()
        return {str(row["chunk_id"]): _indexed_chunk_from_row(row) for row in rows}

    def upsert_document(self, document: DocumentManifest, *, seen_at: str, indexed_at: str | None) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO rag_documents (
                    doc_id, source_path, source_hash, acl_hash, doc_version, status,
                    last_seen_at, last_indexed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(doc_id) DO UPDATE SET
                    source_path = excluded.source_path,
                    source_hash = excluded.source_hash,
                    acl_hash = excluded.acl_hash,
                    doc_version = excluded.doc_version,
                    status = excluded.status,
                    last_seen_at = excluded.last_seen_at,
                    last_indexed_at = COALESCE(excluded.last_indexed_at, rag_documents.last_indexed_at)
                """,
                (
                    document.doc_id,
                    document.source_path,
                    document.source_hash,
                    document.acl_hash,
                    document.doc_version,
                    document.status,
                    seen_at,
                    indexed_at,
                ),
            )

    def replace_document_chunks(self, document: DocumentManifest) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM rag_chunks WHERE doc_id = ?", (document.doc_id,))
            conn.executemany(
                """
                INSERT INTO rag_chunks (
                    chunk_id, doc_id, doc_version, chunk_index, chunk_ref,
                    content_hash, payload_json, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [_chunk_row(chunk) for chunk in document.chunks],
            )

    def mark_document_deleted(self, doc_id: str, *, seen_at: str | None = None) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                UPDATE rag_documents
                SET status = 'deleted', last_seen_at = COALESCE(?, last_seen_at)
                WHERE doc_id = ?
                """,
                (seen_at, doc_id),
            )
            conn.execute("UPDATE rag_chunks SET status = 'deleted' WHERE doc_id = ?", (doc_id,))

    def record_run(self, summary: IndexRunSummary) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO rag_index_runs (
                    run_id, started_at, ended_at, mode, status, added_docs,
                    modified_docs, deleted_docs, skipped_docs, failed_docs
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    summary.run_id,
                    summary.started_at,
                    summary.ended_at,
                    summary.mode,
                    summary.status,
                    summary.added_docs,
                    summary.modified_docs,
                    summary.deleted_docs,
                    summary.skipped_docs,
                    summary.failed_docs,
                ),
            )

    def record_error(
        self,
        *,
        run_id: str,
        target: str,
        doc_id: str | None = None,
        chunk_id: str | None = None,
        error_message: str,
    ) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO rag_index_errors (run_id, target, doc_id, chunk_id, error_message)
                VALUES (?, ?, ?, ?, ?)
                """,
                (run_id, target, doc_id, chunk_id, error_message),
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            with conn:
                yield conn
        finally:
            conn.close()


class PostgresRagIndexStateStore:
    def __init__(self, database_url: str) -> None:
        if not database_url.strip():
            raise ValueError("Postgres database URL is required.")
        self.database_url = database_url

    def init_schema(self) -> None:
        with self._connect() as conn:
            with conn.cursor() as cursor:
                for statement in POSTGRES_SCHEMA:
                    cursor.execute(statement)
            conn.commit()

    def load_documents(self) -> dict[str, IndexedDocument]:
        with self._connect() as conn:
            with conn.cursor(row_factory=_dict_row()) as cursor:
                cursor.execute(
                    """
                    SELECT doc_id, source_path, source_hash, acl_hash, doc_version, status,
                           last_seen_at, last_indexed_at
                    FROM rag_documents
                    """
                )
                rows = cursor.fetchall()
        return {str(row["doc_id"]): _indexed_document_from_row(row) for row in rows}

    def load_chunks(self) -> dict[str, IndexedChunk]:
        with self._connect() as conn:
            with conn.cursor(row_factory=_dict_row()) as cursor:
                cursor.execute(
                    """
                    SELECT chunk_id, doc_id, doc_version, chunk_index, chunk_ref, content_hash, status
                    FROM rag_chunks
                    """
                )
                rows = cursor.fetchall()
        return {str(row["chunk_id"]): _indexed_chunk_from_row(row) for row in rows}

    def upsert_document(self, document: DocumentManifest, *, seen_at: str, indexed_at: str | None) -> None:
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO rag_documents (
                        doc_id, source_path, source_hash, acl_hash, doc_version, status,
                        last_seen_at, last_indexed_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT(doc_id) DO UPDATE SET
                        source_path = EXCLUDED.source_path,
                        source_hash = EXCLUDED.source_hash,
                        acl_hash = EXCLUDED.acl_hash,
                        doc_version = EXCLUDED.doc_version,
                        status = EXCLUDED.status,
                        last_seen_at = EXCLUDED.last_seen_at,
                        last_indexed_at = COALESCE(EXCLUDED.last_indexed_at, rag_documents.last_indexed_at)
                    """,
                    (
                        document.doc_id,
                        document.source_path,
                        document.source_hash,
                        document.acl_hash,
                        document.doc_version,
                        document.status,
                        seen_at,
                        indexed_at,
                    ),
                )
            conn.commit()

    def replace_document_chunks(self, document: DocumentManifest) -> None:
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM rag_chunks WHERE doc_id = %s", (document.doc_id,))
                cursor.executemany(
                    """
                    INSERT INTO rag_chunks (
                        chunk_id, doc_id, doc_version, chunk_index, chunk_ref,
                        content_hash, payload_json, status
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    [_chunk_row(chunk) for chunk in document.chunks],
                )
            conn.commit()

    def mark_document_deleted(self, doc_id: str, *, seen_at: str | None = None) -> None:
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE rag_documents
                    SET status = 'deleted', last_seen_at = COALESCE(%s, last_seen_at)
                    WHERE doc_id = %s
                    """,
                    (seen_at, doc_id),
                )
                cursor.execute("UPDATE rag_chunks SET status = 'deleted' WHERE doc_id = %s", (doc_id,))
            conn.commit()

    def record_run(self, summary: IndexRunSummary) -> None:
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO rag_index_runs (
                        run_id, started_at, ended_at, mode, status, added_docs,
                        modified_docs, deleted_docs, skipped_docs, failed_docs
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        summary.run_id,
                        summary.started_at,
                        summary.ended_at,
                        summary.mode,
                        summary.status,
                        summary.added_docs,
                        summary.modified_docs,
                        summary.deleted_docs,
                        summary.skipped_docs,
                        summary.failed_docs,
                    ),
                )
            conn.commit()

    def record_error(
        self,
        *,
        run_id: str,
        target: str,
        doc_id: str | None = None,
        chunk_id: str | None = None,
        error_message: str,
    ) -> None:
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO rag_index_errors (run_id, target, doc_id, chunk_id, error_message)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (run_id, target, doc_id, chunk_id, error_message),
                )
            conn.commit()

    def _connect(self) -> Any:
        try:
            import psycopg
        except ImportError as exc:
            raise RuntimeError("psycopg is required when RAG_DATABASE_URL uses PostgreSQL.") from exc
        return psycopg.connect(self.database_url)


class ConfiguredRagIndexStateStore:
    def __new__(cls) -> RagIndexStateStore:
        _load_dotenv_files()
        database_url = _env("RAG_DATABASE_URL", default=DEFAULT_POSTGRES_URL)
        if _is_postgres_url(database_url):
            return PostgresRagIndexStateStore(database_url)
        sqlite_path = _env("RAG_STATE_SQLITE_PATH", default=str(DEFAULT_SQLITE_PATH))
        return SqliteRagIndexStateStore(sqlite_path)


SQLITE_SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS rag_documents (
        doc_id TEXT PRIMARY KEY,
        source_path TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        acl_hash TEXT NOT NULL,
        doc_version TEXT NOT NULL,
        status TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_indexed_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS rag_chunks (
        chunk_id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL,
        doc_version TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_ref TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc_id ON rag_chunks(doc_id)",
    """
    CREATE TABLE IF NOT EXISTS rag_index_runs (
        run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        added_docs INTEGER NOT NULL,
        modified_docs INTEGER NOT NULL,
        deleted_docs INTEGER NOT NULL,
        skipped_docs INTEGER NOT NULL,
        failed_docs INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS rag_index_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        target TEXT NOT NULL,
        doc_id TEXT,
        chunk_id TEXT,
        error_message TEXT NOT NULL
    )
    """,
]


POSTGRES_SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS rag_documents (
        doc_id TEXT PRIMARY KEY,
        source_path TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        acl_hash TEXT NOT NULL,
        doc_version TEXT NOT NULL,
        status TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_indexed_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS rag_chunks (
        chunk_id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL,
        doc_version TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_ref TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc_id ON rag_chunks(doc_id)",
    """
    CREATE TABLE IF NOT EXISTS rag_index_runs (
        run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        added_docs INTEGER NOT NULL,
        modified_docs INTEGER NOT NULL,
        deleted_docs INTEGER NOT NULL,
        skipped_docs INTEGER NOT NULL,
        failed_docs INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS rag_index_errors (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        run_id TEXT NOT NULL,
        target TEXT NOT NULL,
        doc_id TEXT,
        chunk_id TEXT,
        error_message TEXT NOT NULL
    )
    """,
]


def _chunk_row(chunk: ChunkManifest) -> tuple[Any, ...]:
    return (
        chunk.chunk_id,
        chunk.doc_id,
        chunk.doc_version,
        chunk.chunk_index,
        chunk.chunk_ref,
        chunk.content_hash,
        json.dumps(chunk.to_payload(), ensure_ascii=False, sort_keys=True),
        chunk.status or ACTIVE_STATUS,
    )


def _indexed_document_from_row(row: Any) -> IndexedDocument:
    return IndexedDocument(
        doc_id=str(row["doc_id"]),
        source_path=str(row["source_path"]),
        source_hash=str(row["source_hash"]),
        acl_hash=str(row["acl_hash"]),
        doc_version=str(row["doc_version"]),
        status=str(row["status"]),
        last_seen_at=str(row["last_seen_at"]),
        last_indexed_at=row["last_indexed_at"],
    )


def _indexed_chunk_from_row(row: Any) -> IndexedChunk:
    return IndexedChunk(
        chunk_id=str(row["chunk_id"]),
        doc_id=str(row["doc_id"]),
        doc_version=str(row["doc_version"]),
        chunk_index=int(row["chunk_index"]),
        chunk_ref=str(row["chunk_ref"]),
        content_hash=str(row["content_hash"]),
        status=str(row["status"]),
    )


def _dict_row() -> Any:
    try:
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise RuntimeError("psycopg is required when RAG_DATABASE_URL uses PostgreSQL.") from exc
    return dict_row


def _is_postgres_url(value: str) -> bool:
    if not value.strip():
        return False
    scheme = urlparse(value).scheme
    return scheme in {"postgres", "postgresql"}


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
    backend_root = Path(__file__).resolve().parents[2]
    project_root = backend_root.parent
    load_dotenv(project_root / ".env", override=False)
    load_dotenv(backend_root / ".env", override=False)
