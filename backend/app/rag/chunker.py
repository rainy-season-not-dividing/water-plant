from collections.abc import Iterable
from hashlib import sha1

from .schemas import KnowledgeChunk, KnowledgeMetadata


class SimpleTextChunker:
    """Temporary deterministic chunker; replace with document-aware chunking later."""

    def __init__(self, chunk_size: int = 900, overlap: int = 120) -> None:
        self.chunk_size = chunk_size
        self.overlap = overlap

    def split_text(self, text: str, *, source: str) -> Iterable[KnowledgeChunk]:
        normalized = text.strip()
        if not normalized:
            return []

        step = max(1, self.chunk_size - self.overlap)
        chunks: list[KnowledgeChunk] = []
        for index, start in enumerate(range(0, len(normalized), step)):
            chunk_text = normalized[start : start + self.chunk_size].strip()
            if not chunk_text:
                continue
            digest = sha1(f"{source}:{index}:{chunk_text}".encode("utf-8")).hexdigest()
            chunks.append(
                KnowledgeChunk(
                    id=digest,
                    text=chunk_text,
                    metadata=KnowledgeMetadata(
                        source=source,
                        knowledge_type="process_doc",
                    ),
                )
            )
        return chunks
