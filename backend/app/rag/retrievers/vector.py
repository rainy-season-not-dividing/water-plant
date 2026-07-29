from __future__ import annotations

from .qdrant_vector import QdrantVectorRetriever


class VectorRetriever(QdrantVectorRetriever):
    """Backward-compatible alias for explicit vector debug paths."""

    pass
