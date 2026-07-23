from __future__ import annotations

from collections.abc import Sequence
import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from .manifest import ACTIVE_STATUS, ChunkManifest
from .schemas import KnowledgeChunk, KnowledgeMetadata, RetrievalRequest, RetrievalResult


DEFAULT_INDEX = "water_plant_rag_chunks"


class ElasticsearchStoreError(RuntimeError):
    pass


class ElasticsearchHttpError(ElasticsearchStoreError):
    def __init__(self, status_code: int, body: str) -> None:
        super().__init__(f"Elasticsearch HTTP {status_code}: {body}")
        self.status_code = status_code
        self.body = body


class ElasticsearchHttpClient:
    def __init__(self, *, url: str, api_key: str = "", timeout_seconds: float = 20.0) -> None:
        if not url.strip():
            raise ElasticsearchStoreError("ELASTICSEARCH_URL is not configured.")
        self.url = url.rstrip("/")
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def request(self, method: str, path: str, json_body: dict[str, Any] | None = None) -> dict[str, Any]:
        body = None
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"ApiKey {self.api_key}"
        if json_body is not None:
            body = json.dumps(json_body, ensure_ascii=False).encode("utf-8")
        request = Request(f"{self.url}{path}", data=body, headers=headers, method=method.upper())
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                response_body = response.read().decode("utf-8")
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise ElasticsearchHttpError(exc.code, error_body) from exc
        except URLError as exc:
            raise ElasticsearchStoreError(f"Cannot connect to Elasticsearch: {exc}") from exc
        if not response_body.strip():
            return {}
        try:
            payload = json.loads(response_body)
        except json.JSONDecodeError as exc:
            raise ElasticsearchStoreError(f"Elasticsearch returned invalid JSON: {response_body[:200]}") from exc
        if not isinstance(payload, dict):
            raise ElasticsearchStoreError("Elasticsearch response must be a JSON object.")
        return payload


class ElasticsearchChunkStore:
    def __init__(
        self,
        *,
        url: str = "http://127.0.0.1:9200",
        index_name: str = DEFAULT_INDEX,
        api_key: str = "",
        client: Any | None = None,
    ) -> None:
        if not index_name.strip():
            raise ElasticsearchStoreError("Elasticsearch index name is not configured.")
        self.index_name = index_name
        self._client = client or ElasticsearchHttpClient(url=url, api_key=api_key)

    def ensure_index(self) -> None:
        path = f"/{quote(self.index_name)}"
        try:
            self._client.request("HEAD", path)
        except ElasticsearchHttpError as exc:
            if exc.status_code != 404:
                raise
            self._client.request("PUT", path, {"mappings": INDEX_MAPPING})

    def upsert_chunks(self, chunks: Sequence[ChunkManifest], *, refresh: bool = False) -> int:
        if not chunks:
            return 0
        self.ensure_index()
        for chunk in chunks:
            query = urlencode({"refresh": str(refresh).lower()})
            self._client.request(
                "PUT",
                f"/{quote(self.index_name)}/_doc/{quote(chunk.chunk_id)}?{query}",
                chunk.to_payload(),
            )
        return len(chunks)

    def delete_doc_chunks(self, doc_id: str, *, refresh: bool = False) -> int:
        self.ensure_index()
        query = urlencode({"refresh": str(refresh).lower(), "conflicts": "proceed"})
        body = {"query": {"term": {"doc_id": doc_id}}}
        response = self._client.request(
            "POST",
            f"/{quote(self.index_name)}/_delete_by_query?{query}",
            body,
        )
        deleted = response.get("deleted")
        return int(deleted) if isinstance(deleted, int) else 0

    def count_chunks(self) -> int:
        self.ensure_index()
        response = self._client.request(
            "GET",
            f"/{quote(self.index_name)}/_count",
            {"query": {"term": {"status": ACTIVE_STATUS}}},
        )
        count = response.get("count")
        return int(count) if isinstance(count, int) else 0

    def fetch_chunk_payloads(self, chunk_ids: Sequence[str]) -> dict[str, dict[str, Any]]:
        if not chunk_ids:
            return {}
        self.ensure_index()
        response = self._client.request(
            "POST",
            f"/{quote(self.index_name)}/_search",
            {
                "size": len(chunk_ids),
                "_source": ["chunk_id", "doc_id", "doc_version", "content_hash", "status"],
                "query": {"terms": {"chunk_id": list(chunk_ids)}},
            },
        )
        docs = ((response.get("hits") or {}).get("hits") or [])
        if not isinstance(docs, list):
            raise ElasticsearchStoreError("Elasticsearch search hits must be a list.")
        payloads: dict[str, dict[str, Any]] = {}
        for doc in docs:
            if not isinstance(doc, dict):
                continue
            source = doc.get("_source")
            if isinstance(source, dict):
                payloads[str(source.get("chunk_id") or doc.get("_id"))] = source
        return payloads

    def search(self, request: RetrievalRequest, *, candidate_k: int | None = None) -> list[RetrievalResult]:
        limit = candidate_k or request.top_k
        body = {
            "size": limit,
            "query": {
                "bool": {
                    "must": [
                        {
                            "multi_match": {
                                "query": request.query,
                                "fields": [
                                    "title^4",
                                    "heading_path^3",
                                    "identifiers^3",
                                    "source_locator^2",
                                    "content",
                                    "normalized_content",
                                ],
                                "type": "best_fields",
                            }
                        }
                    ],
                    "filter": _filters_from_request(request),
                }
            },
        }
        response = self._client.request("POST", f"/{quote(self.index_name)}/_search", body)
        hits = ((response.get("hits") or {}).get("hits") or [])
        if not isinstance(hits, list):
            raise ElasticsearchStoreError("Elasticsearch search hits must be a list.")
        return [
            _retrieval_result_from_hit(hit, rank=index)
            for index, hit in enumerate(hits, start=1)
            if isinstance(hit, dict)
        ]


class ConfiguredElasticsearchChunkStore(ElasticsearchChunkStore):
    def __init__(
        self,
        *,
        url: str | None = None,
        index_name: str | None = None,
        api_key: str | None = None,
    ) -> None:
        _load_dotenv_files()
        super().__init__(
            url=url or _env("ELASTICSEARCH_URL", default="http://127.0.0.1:9200"),
            index_name=index_name or _env("RAG_ELASTICSEARCH_INDEX", default=DEFAULT_INDEX),
            api_key=api_key if api_key is not None else _env("ELASTICSEARCH_API_KEY"),
        )


INDEX_MAPPING = {
    "properties": {
        "chunk_id": {"type": "keyword"},
        "doc_id": {"type": "keyword"},
        "doc_version": {"type": "keyword"},
        "content_hash": {"type": "keyword"},
        "source_path": {"type": "keyword"},
        "source_locator": {"type": "keyword"},
        "title": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
        "heading_path": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
        "content": {"type": "text"},
        "normalized_content": {"type": "text"},
        "identifiers": {"type": "keyword"},
        "agent_scope": {"type": "keyword"},
        "process_areas": {"type": "keyword"},
        "device_ids": {"type": "keyword"},
        "incident_types": {"type": "keyword"},
        "knowledge_type": {"type": "keyword"},
        "acl.roles": {"type": "keyword"},
        "acl.tenant": {"type": "keyword"},
        "visibility": {"type": "keyword"},
        "status": {"type": "keyword"},
        "updated_at": {"type": "date"},
    }
}


def _filters_from_request(request: RetrievalRequest) -> list[dict[str, Any]]:
    filters: list[dict[str, Any]] = [{"term": {"status": ACTIVE_STATUS}}, _acl_filter_from_request(request)]
    if request.agent_id:
        filters.append({"term": {"agent_scope": request.agent_id}})
    if request.knowledge_types:
        filters.append({"terms": {"knowledge_type": list(request.knowledge_types)}})
    if request.process_areas:
        filters.append({"terms": {"process_areas": request.process_areas}})
    if request.device_ids:
        filters.append({"terms": {"device_ids": request.device_ids}})
    if request.incident_types:
        filters.append({"terms": {"incident_types": request.incident_types}})
    return filters


def _acl_filter_from_request(request: RetrievalRequest) -> dict[str, Any]:
    should: list[dict[str, Any]] = [{"term": {"visibility": "public"}}]
    if request.tenant_id:
        should.append({"term": {"acl.tenant": request.tenant_id}})
    if request.roles:
        should.append({"terms": {"acl.roles": request.roles}})
    if len(should) == 1:
        return should[0]
    return {"bool": {"should": should, "minimum_should_match": 1}}


def _retrieval_result_from_hit(hit: dict[str, Any], *, rank: int) -> RetrievalResult:
    payload = hit.get("_source")
    if not isinstance(payload, dict):
        payload = {}
    metadata = KnowledgeMetadata(
        source=str(payload.get("source") or ""),
        knowledge_type=payload.get("knowledge_type") or "process_doc",
        agent_scope=_list(payload.get("agent_scope")),
        process_areas=_list(payload.get("process_areas")),
        device_ids=_list(payload.get("device_ids")),
        incident_types=_list(payload.get("incident_types")),
        source_version=payload.get("source_version"),
        safety_level=payload.get("safety_level"),
        effective_time=payload.get("effective_time"),
        extra={key: value for key, value in payload.items() if key not in _KNOWN_METADATA},
    )
    return RetrievalResult(
        chunk=KnowledgeChunk(
            id=str(payload.get("chunk_id") or hit.get("_id") or ""),
            text=str(payload.get("display_text") or payload.get("content") or ""),
            metadata=metadata,
        ),
        score=float(hit.get("_score") or 0.0),
        rank=rank,
    )


def _list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


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


_KNOWN_METADATA = {
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
