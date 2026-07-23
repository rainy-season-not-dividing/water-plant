from __future__ import annotations

from dataclasses import replace
import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .schemas import RetrievalResult


class RerankError(RuntimeError):
    pass


class HttpReranker:
    """Optional HTTP reranker boundary.

    Expected request:
      {"model": "...", "query": "...", "documents": [{"id": "...", "text": "..."}], "top_n": 10}

    Expected response:
      {"results": [{"index": 0, "score": 0.98}, ...]}
    """

    def __init__(
        self,
        *,
        endpoint: str,
        model: str = "",
        api_key: str = "",
        timeout_seconds: float = 20.0,
    ) -> None:
        if not endpoint.strip():
            raise RerankError("RAG_RERANK_ENDPOINT is required when reranking is enabled.")
        self.endpoint = endpoint
        self.model = model
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def rerank(self, *, query: str, results: list[RetrievalResult], top_n: int) -> list[RetrievalResult]:
        if not results:
            return []
        body = {
            "model": self.model,
            "query": query,
            "documents": [
                {
                    "id": result.chunk.id,
                    "text": result.chunk.text,
                    "metadata": {
                        "source": result.chunk.metadata.source,
                        "source_locator": result.chunk.metadata.extra.get("source_locator"),
                    },
                }
                for result in results
            ],
            "top_n": top_n,
        }
        payload = self._post(body)
        raw_results = payload.get("results")
        if not isinstance(raw_results, list):
            raise RerankError("reranker response must contain a results list.")

        reranked: list[RetrievalResult] = []
        seen: set[int] = set()
        for item in raw_results:
            if not isinstance(item, dict):
                continue
            index = item.get("index")
            if index is None and item.get("id") is not None:
                index = _index_by_id(results, str(item.get("id")))
            if not isinstance(index, int) or index < 0 or index >= len(results) or index in seen:
                continue
            seen.add(index)
            score = float(item.get("score") or results[index].score)
            reranked.append(replace(results[index], score=score, rank=len(reranked) + 1))
            if len(reranked) >= top_n:
                break

        if not reranked:
            raise RerankError("reranker returned no usable results.")
        return reranked

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = Request(
            self.endpoint,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                response_body = response.read().decode("utf-8")
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise RerankError(f"reranker HTTP {exc.code}: {error_body}") from exc
        except URLError as exc:
            raise RerankError(f"cannot connect to reranker: {exc}") from exc
        try:
            payload = json.loads(response_body)
        except json.JSONDecodeError as exc:
            raise RerankError(f"reranker returned invalid JSON: {response_body[:200]}") from exc
        if not isinstance(payload, dict):
            raise RerankError("reranker response must be a JSON object.")
        return payload


class ConfiguredReranker(HttpReranker):
    def __init__(self) -> None:
        _load_dotenv_files()
        super().__init__(
            endpoint=_env("RAG_RERANK_ENDPOINT"),
            model=_env("RAG_RERANK_MODEL"),
            api_key=_env("RAG_RERANK_API_KEY"),
            timeout_seconds=float(_env("RAG_RERANK_TIMEOUT_SECONDS", default="20")),
        )


def rerank_enabled() -> bool:
    _load_dotenv_files()
    return _env("RAG_RERANK_ENABLED", default="false").lower() in {"1", "true", "yes", "on"}


def configured_rerank_top_n(default: int) -> int:
    return max(1, int(_env("RAG_RERANK_TOP_N", default=str(default))))


def configured_final_top_k(default: int) -> int:
    return max(1, int(_env("RAG_FINAL_TOP_K", default=str(default))))


def _index_by_id(results: list[RetrievalResult], chunk_id: str) -> int | None:
    for index, result in enumerate(results):
        if result.chunk.id == chunk_id:
            return index
    return None


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
