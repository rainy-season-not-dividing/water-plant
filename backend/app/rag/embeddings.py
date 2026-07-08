from __future__ import annotations

from collections.abc import Sequence
import os
from pathlib import Path
from typing import Any


class EmbeddingNotConfiguredError(RuntimeError):
    pass


class EmbeddingProviderError(RuntimeError):
    pass


class OpenAICompatibleEmbeddingProvider:
    """Embedding provider for OpenAI-compatible endpoints such as DashScope compatible mode."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str = "text-embedding-v4",
        dimension: int = 1024,
        request_dimension: bool = True,
        client: Any | None = None,
    ) -> None:
        if not api_key.strip():
            raise EmbeddingNotConfiguredError("Embedding API key is not configured.")
        if not base_url.strip():
            raise EmbeddingNotConfiguredError("Embedding base URL is not configured.")
        if not model.strip():
            raise EmbeddingNotConfiguredError("Embedding model is not configured.")
        if dimension <= 0:
            raise EmbeddingNotConfiguredError("Embedding dimension must be greater than 0.")

        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.dimension = dimension
        self.request_dimension = request_dimension
        self._client = client or self._build_client()

    def embed_text(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        inputs = [text for text in texts]
        if not inputs:
            return []
        if any(not isinstance(text, str) or not text.strip() for text in inputs):
            raise EmbeddingProviderError("Embedding inputs must be non-empty strings.")

        request: dict[str, Any] = {
            "model": self.model,
            "input": inputs,
        }
        if self.request_dimension:
            request["dimensions"] = self.dimension

        response = self._client.embeddings.create(**request)
        data = list(getattr(response, "data", []))
        if len(data) != len(inputs):
            raise EmbeddingProviderError(
                f"Embedding response count mismatch: expected {len(inputs)}, got {len(data)}"
            )

        vectors: list[list[float]] = []
        for index, item in enumerate(data, start=1):
            embedding = getattr(item, "embedding", None)
            if not isinstance(embedding, list) or not embedding:
                raise EmbeddingProviderError(f"Embedding response item {index} has no vector.")
            vector = [float(value) for value in embedding]
            if len(vector) != self.dimension:
                raise EmbeddingProviderError(
                    f"Embedding dimension mismatch for item {index}: "
                    f"expected {self.dimension}, got {len(vector)}"
                )
            vectors.append(vector)
        return vectors

    def _build_client(self) -> Any:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise EmbeddingNotConfiguredError("The openai package is required for compatible embeddings.") from exc
        return OpenAI(api_key=self.api_key, base_url=self.base_url)


class ConfiguredEmbeddingProvider:
    """Environment-configured embedding provider boundary."""

    def __init__(self) -> None:
        _load_dotenv_files()
        self.provider = _env("RAG_EMBEDDING_PROVIDER", "EMBEDDING_PROVIDER", default="disabled").lower()
        self.model = _env("RAG_EMBEDDING_MODEL", "EMBEDDING_MODEL", default="text-embedding-v4")
        self.dimension = int(_env("RAG_EMBEDDING_DIMENSION", "EMBEDDING_DIMENSION", default="1024"))
        self.base_url = _env("RAG_EMBEDDING_BASE_URL", "OPENAI_COMPATIBLE_BASE_URL", "EMBEDDING_BASE_URL")
        self.api_key = _env("RAG_EMBEDDING_API_KEY", "DASHSCOPE_API_KEY", "EMBEDDING_API_KEY")
        self.request_dimension = _env(
            "RAG_EMBEDDING_REQUEST_DIMENSION",
            "EMBEDDING_REQUEST_DIMENSION",
            default="true",
        ).lower() not in {"0", "false", "no"}
        self._delegate = self._build_delegate()

    def embed_text(self, text: str) -> list[float]:
        return self._delegate.embed_text(text)

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        return self._delegate.embed_texts(texts)

    def _build_delegate(self) -> OpenAICompatibleEmbeddingProvider:
        if not self.provider or self.provider == "disabled":
            raise EmbeddingNotConfiguredError("Embedding provider is not configured.")
        if self.provider not in {"openai_compatible", "dashscope", "aliyun"}:
            raise EmbeddingNotConfiguredError(f"Unsupported embedding provider: {self.provider}")
        return OpenAICompatibleEmbeddingProvider(
            api_key=self.api_key,
            base_url=self.base_url,
            model=self.model,
            dimension=self.dimension,
            request_dimension=self.request_dimension,
        )


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
