from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict, is_dataclass
from hashlib import sha1
import json
import os
from pathlib import Path
import uuid
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .ingestion import PlannedEmbeddingChunk
from .schemas import KnowledgeChunk, KnowledgeMetadata, RetrievalRequest, RetrievalResult


DEFAULT_COLLECTION = "water_plant_rag_chunks"
DEFAULT_DISTANCE = "Cosine"
DEFAULT_VECTOR_DIMENSION = 1024


class QdrantStoreError(RuntimeError):
    pass


class QdrantHttpError(QdrantStoreError):
    def __init__(self, status_code: int, body: str) -> None:
        super().__init__(f"Qdrant HTTP {status_code}: {body}")
        self.status_code = status_code
        self.body = body


class QdrantHttpClient:
    """Small HTTP boundary for Qdrant's REST API."""

    def __init__(self, *, url: str, api_key: str = "", timeout_seconds: float = 20.0) -> None:
        if not url.strip():
            raise QdrantStoreError("QDRANT_URL is not configured.")
        self.url = url.rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def request(self, method: str, path: str, json_body: dict[str, Any] | None = None) -> dict[str, Any]:
        body = None
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["api-key"] = self.api_key
        if json_body is not None:
            body = json.dumps(json_body, ensure_ascii=False).encode("utf-8")
        request = Request(
            f"{self.url}{path}",
            data=body,
            headers=headers,
            method=method.upper(),
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                response_body = response.read().decode("utf-8")
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise QdrantHttpError(exc.code, error_body) from exc
        except URLError as exc:
            raise QdrantStoreError(f"Cannot connect to Qdrant: {exc}") from exc

        if not response_body.strip():
            return {}
        try:
            payload = json.loads(response_body)
        except json.JSONDecodeError as exc:
            raise QdrantStoreError(f"Qdrant returned invalid JSON: {response_body[:200]}") from exc
        if not isinstance(payload, dict):
            raise QdrantStoreError("Qdrant response must be a JSON object.")
        return payload


class QdrantVectorStore:
    """Vector store adapter for approved RAG chunks."""

    def __init__(
        self,
        *,
        url: str = "http://127.0.0.1:6333",
        collection_name: str = DEFAULT_COLLECTION,
        vector_dimension: int = DEFAULT_VECTOR_DIMENSION,
        distance: str = DEFAULT_DISTANCE,
        api_key: str = "",
        client: Any | None = None,
    ) -> None:
        if not collection_name.strip():
            raise QdrantStoreError("Qdrant collection name is not configured.")
        if vector_dimension <= 0:
            raise QdrantStoreError("Qdrant vector dimension must be greater than 0.")
        self.collection_name = collection_name
        self.vector_dimension = vector_dimension
        self.distance = distance
        self._client = client or QdrantHttpClient(url=url, api_key=api_key)

    def ensure_collection(self) -> None:
        path = f"/collections/{self.collection_name}"
        try:
            response = self._client.request("GET", path)
        except QdrantHttpError as exc:
            if exc.status_code != 404:
                raise
            self._create_collection()
            return

        existing_size = _extract_vector_size(response)
        if existing_size is not None and existing_size != self.vector_dimension:
            raise QdrantStoreError(
                f"Qdrant collection {self.collection_name!r} vector size mismatch: "
                f"expected {self.vector_dimension}, got {existing_size}"
            )
        self.ensure_payload_indexes()

    def ensure_payload_indexes(self) -> None:
        for field_name in ("doc_id", "doc_version", "visibility", "acl.roles", "acl.tenant", "status"):
            self._create_payload_index(field_name, "keyword")

    def upsert_embedding_chunks(
        self,
        chunks: Sequence[PlannedEmbeddingChunk],
        vectors: Sequence[list[float]],
        *,
        wait: bool = True,
    ) -> int:
        if len(chunks) != len(vectors):
            raise QdrantStoreError(
                f"chunk/vector count mismatch: expected {len(chunks)}, got {len(vectors)} vectors"
            )
        if not chunks:
            return 0

        points = []
        for chunk, vector in zip(chunks, vectors, strict=True):
            self._validate_vector(vector)
            points.append(
                {
                    "id": stable_point_id(chunk.id),
                    "vector": vector,
                    "payload": embedding_chunk_payload(chunk),
                }
            )

        self.ensure_collection()
        query = urlencode({"wait": str(wait).lower()})
        self._client.request(
            "PUT",
            f"/collections/{self.collection_name}/points?{query}",
            {"points": points},
        )
        return len(points)

    def upsert_chunks(self, chunks: Sequence[KnowledgeChunk], vectors: Sequence[list[float]]) -> None:
        planned = [
            PlannedEmbeddingChunk(
                id=chunk.id,
                chunk_type="content_chunk",
                text_for_embedding=chunk.text,
                display_text=chunk.text,
                metadata=_metadata_to_payload(chunk.metadata),
                char_count=len(chunk.text),
            )
            for chunk in chunks
        ]
        self.upsert_embedding_chunks(planned, vectors)

    def delete_doc_chunks(self, doc_id: str, *, wait: bool = True) -> int:
        self.ensure_collection()
        query = urlencode({"wait": str(wait).lower()})
        self._client.request(
            "POST",
            f"/collections/{self.collection_name}/points/delete?{query}",
            {
                "filter": {
                    "must": [
                        {"key": "doc_id", "match": {"value": doc_id}},
                    ]
                }
            },
        )
        return 0

    def count_chunks(self) -> int:
        self.ensure_collection()
        response = self._client.request(
            "POST",
            f"/collections/{self.collection_name}/points/count",
            {
                "exact": True,
                "filter": {"must": [_match_value("status", "active")]},
            },
        )
        result = response.get("result")
        if isinstance(result, dict) and isinstance(result.get("count"), int):
            return int(result["count"])
        return 0

    def fetch_chunk_payloads(self, chunk_ids: Sequence[str]) -> dict[str, dict[str, Any]]:
        if not chunk_ids:
            return {}
        self.ensure_collection()
        response = self._client.request(
            "POST",
            f"/collections/{self.collection_name}/points",
            {
                "ids": [stable_point_id(chunk_id) for chunk_id in chunk_ids],
                "with_payload": True,
                "with_vector": False,
            },
        )
        points = response.get("result")
        if not isinstance(points, list):
            raise QdrantStoreError("Qdrant retrieve points result must be a list.")
        payloads: dict[str, dict[str, Any]] = {}
        for point in points:
            if not isinstance(point, dict):
                continue
            payload = point.get("payload")
            if isinstance(payload, dict):
                payloads[str(payload.get("chunk_id") or "")] = payload
        return {chunk_id: payload for chunk_id, payload in payloads.items() if chunk_id}

    def search(self, request: RetrievalRequest, query_vector: list[float]) -> list[RetrievalResult]:
        self._validate_vector(query_vector)
        body: dict[str, Any] = {
            "vector": query_vector,
            "limit": request.top_k,
            "with_payload": True,
        }
        query_filter = qdrant_filter_from_request(request)
        if query_filter:
            body["filter"] = query_filter

        response = self._client.request(
            "POST",
            f"/collections/{self.collection_name}/points/search",
            body,
        )
        raw_results = response.get("result", [])
        if not isinstance(raw_results, list):
            raise QdrantStoreError("Qdrant search response result must be a list.")
        return [
            _retrieval_result_from_point(point, rank=index)
            for index, point in enumerate(raw_results, start=1)
            if isinstance(point, dict)
        ]

    def _create_collection(self) -> None:
        self._client.request(
            "PUT",
            f"/collections/{self.collection_name}",
            {
                "vectors": {
                    "size": self.vector_dimension,
                    "distance": self.distance,
                }
            },
        )
        self.ensure_payload_indexes()

    def _create_payload_index(self, field_name: str, field_schema: str) -> None:
        try:
            self._client.request(
                "PUT",
                f"/collections/{self.collection_name}/index",
                {
                    "field_name": field_name,
                    "field_schema": field_schema,
                },
            )
        except QdrantHttpError as exc:
            if exc.status_code not in {400, 409}:
                raise

    def _validate_vector(self, vector: list[float]) -> None:
        if len(vector) != self.vector_dimension:
            raise QdrantStoreError(
                f"vector dimension mismatch: expected {self.vector_dimension}, got {len(vector)}"
            )


class ConfiguredQdrantVectorStore(QdrantVectorStore):
    """Environment-configured Qdrant store boundary."""

    def __init__(
        self,
        *,
        url: str | None = None,
        collection_name: str | None = None,
        vector_dimension: int | None = None,
        distance: str | None = None,
        api_key: str | None = None,
    ) -> None:
        _load_dotenv_files()
        super().__init__(
            url=url or _env("QDRANT_URL", default="http://127.0.0.1:6333"),
            collection_name=collection_name or _env("RAG_QDRANT_COLLECTION", default=DEFAULT_COLLECTION),
            vector_dimension=vector_dimension
            or int(_env("RAG_VECTOR_DIMENSION", "RAG_EMBEDDING_DIMENSION", default=str(DEFAULT_VECTOR_DIMENSION))),
            distance=distance or _env("RAG_QDRANT_DISTANCE", default=DEFAULT_DISTANCE),
            api_key=api_key if api_key is not None else _env("QDRANT_API_KEY"),
        )


def stable_point_id(chunk_id: str) -> str:
    digest = chunk_id if _is_sha1_hex(chunk_id) else sha1(chunk_id.encode("utf-8")).hexdigest()
    return str(uuid.UUID(hex=digest[:32]))


def embedding_chunk_payload(chunk: PlannedEmbeddingChunk) -> dict[str, Any]:
    payload = dict(chunk.metadata)
    source_locator = str(payload.get("source_locator") or "")
    doc_id = str(payload.get("doc_id") or source_locator.split("#", 1)[0])
    normalized_content = _normalize_content(chunk.display_text)
    payload.update(
        {
            "chunk_id": chunk.id,
            "doc_id": doc_id,
            "doc_version": payload.get("doc_version") or payload.get("source_version") or "",
            "content_hash": payload.get("content_hash") or sha1(normalized_content.encode("utf-8")).hexdigest(),
            "source_path": payload.get("source_path") or doc_id,
            "visibility": payload.get("visibility") or "public",
            "status": payload.get("status") or "active",
            "acl": payload.get("acl") or {"roles": [], "tenant": ""},
            "chunk_type": chunk.chunk_type,
            "text_for_embedding": chunk.text_for_embedding,
            "display_text": chunk.display_text,
            "char_count": chunk.char_count,
        }
    )
    return payload


def _normalize_content(value: str) -> str:
    return "\n".join(line.strip() for line in value.strip().splitlines() if line.strip())


def qdrant_filter_from_request(request: RetrievalRequest) -> dict[str, Any]:
    must: list[dict[str, Any]] = [
        _match_value("status", "active"),
        _acl_filter_from_request(request),
    ]
    if request.agent_id:
        must.append(_match_value("agent_scope", request.agent_id))
    if request.knowledge_types:
        must.append(_match_any("knowledge_type", list(request.knowledge_types)))
    if request.process_areas:
        must.append(_match_any("process_areas", request.process_areas))
    if request.device_ids:
        must.append(_match_any("device_ids", request.device_ids))
    if request.incident_types:
        must.append(_match_any("incident_types", request.incident_types))
    return {"must": must} if must else {}


def _acl_filter_from_request(request: RetrievalRequest) -> dict[str, Any]:
    should: list[dict[str, Any]] = [_match_value("visibility", "public")]
    if request.tenant_id:
        should.append(_match_value("acl.tenant", request.tenant_id))
    if request.roles:
        should.append(_match_any("acl.roles", request.roles))
    if len(should) == 1:
        return should[0]
    return {"should": should}


def _match_value(key: str, value: str) -> dict[str, Any]:
    return {"key": key, "match": {"value": value}}


def _match_any(key: str, values: list[str]) -> dict[str, Any]:
    return {"key": key, "match": {"any": values}}


def _retrieval_result_from_point(point: dict[str, Any], *, rank: int) -> RetrievalResult:
    payload = point.get("payload")
    if not isinstance(payload, dict):
        payload = {}
    metadata = KnowledgeMetadata(
        source=str(payload.get("source") or ""),
        knowledge_type=payload.get("knowledge_type") or "process_doc",
        agent_scope=_list_payload(payload.get("agent_scope")),
        process_areas=_list_payload(payload.get("process_areas")),
        device_ids=_list_payload(payload.get("device_ids")),
        incident_types=_list_payload(payload.get("incident_types")),
        source_version=payload.get("source_version"),
        safety_level=payload.get("safety_level"),
        effective_time=payload.get("effective_time"),
        extra=_extra_payload(payload),
    )
    chunk = KnowledgeChunk(
        id=str(payload.get("chunk_id") or point.get("id") or ""),
        text=str(payload.get("display_text") or payload.get("text_for_embedding") or ""),
        metadata=metadata,
    )
    return RetrievalResult(
        chunk=chunk,
        score=float(point.get("score") or 0.0),
        rank=rank,
    )


def _metadata_to_payload(metadata: KnowledgeMetadata) -> dict[str, Any]:
    if is_dataclass(metadata):
        return asdict(metadata)
    return dict(metadata)


def _list_payload(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _extra_payload(payload: dict[str, Any]) -> dict[str, Any]:
    known_keys = {
        "source",
        "knowledge_type",
        "agent_scope",
        "process_areas",
        "device_ids",
        "incident_types",
        "source_version",
        "safety_level",
        "effective_time",
    }
    extra = payload.get("extra")
    if isinstance(extra, dict):
        return dict(extra)
    return {key: value for key, value in payload.items() if key not in known_keys}


def _extract_vector_size(response: dict[str, Any]) -> int | None:
    result = response.get("result")
    if not isinstance(result, dict):
        return None
    config = result.get("config")
    if not isinstance(config, dict):
        return None
    params = config.get("params")
    if not isinstance(params, dict):
        return None
    vectors = params.get("vectors")
    if isinstance(vectors, dict):
        size = vectors.get("size")
        if isinstance(size, int):
            return size
    return None


def _is_sha1_hex(value: str) -> bool:
    if len(value) != 40:
        return False
    try:
        int(value, 16)
    except ValueError:
        return False
    return True


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
