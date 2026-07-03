import os
from collections.abc import Sequence


class EmbeddingNotConfiguredError(RuntimeError):
    pass


class ConfiguredEmbeddingProvider:
    """Placeholder provider boundary for future DashScope/OpenAI/local embeddings."""

    def __init__(self) -> None:
        self.provider = os.getenv("EMBEDDING_PROVIDER", "disabled").strip().lower()
        self.model = os.getenv("EMBEDDING_MODEL", "text-embedding-v4").strip()
        self.dimension = int(os.getenv("EMBEDDING_DIMENSION", "1024"))

    def embed_text(self, text: str) -> list[float]:
        if not self.provider or self.provider == "disabled":
            raise EmbeddingNotConfiguredError("Embedding provider is not configured.")
        raise NotImplementedError("Embedding API integration has not been implemented yet.")

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        if not self.provider or self.provider == "disabled":
            raise EmbeddingNotConfiguredError("Embedding provider is not configured.")
        raise NotImplementedError("Embedding API integration has not been implemented yet.")
