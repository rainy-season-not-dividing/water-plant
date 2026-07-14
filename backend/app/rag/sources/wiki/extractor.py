from __future__ import annotations

from dataclasses import asdict
from hashlib import sha1
from pathlib import Path
from typing import Any

from ...schemas import KnowledgeMetadata, PendingReviewKnowledgeBlock
from .config import WikiSourceConfig
from .parser import WikiDocument, parse_wiki_markdown
from .reader import WikiMarkdownReader


class WikiMarkdownExtractor:
    """Turns approved local wiki Markdown entries into RAG review-compatible blocks."""

    def __init__(self, *, config: WikiSourceConfig, reader: WikiMarkdownReader | None = None) -> None:
        self.config = config
        self.reader = reader or WikiMarkdownReader(config)

    def extract_blocks(self) -> list[PendingReviewKnowledgeBlock]:
        blocks: list[PendingReviewKnowledgeBlock] = []
        for path in self.reader.iter_markdown_files():
            text = self.reader.read_text(path)
            relative_path = path.relative_to(self.config.root).as_posix()
            document = parse_wiki_markdown(text, fallback_title=path.stem)
            blocks.extend(self._document_blocks(document, path=path, relative_path=relative_path))
        return blocks

    def approved_payload(self) -> dict[str, Any]:
        return build_wiki_approved_payload(self.extract_blocks(), root=self.config.root)

    def _document_blocks(
        self,
        document: WikiDocument,
        *,
        path: Path,
        relative_path: str,
    ) -> list[PendingReviewKnowledgeBlock]:
        blocks: list[PendingReviewKnowledgeBlock] = []
        source = f"wikidb:{relative_path}"
        metadata_base = _metadata_values(document.metadata)
        is_outline = path.name.lower() == "index.md"
        for index, section in enumerate(document.sections, start=1):
            section_path = [document.title, *section.section_path]
            if section.title and (not section_path or section_path[-1] != section.title):
                section_path.append(section.title)
            source_locator = f"{relative_path}#section-{index}"
            block_text = section.text.strip()
            if not block_text:
                continue
            metadata = KnowledgeMetadata(
                source=source,
                knowledge_type="process_doc",
                agent_scope=[],
                process_areas=[],
                device_ids=[],
                incident_types=[],
                source_version=metadata_base.get("date"),
                safety_level=None,
                effective_time=metadata_base.get("date"),
                extra={
                    "document_kind": "wiki_markdown",
                    "block_kind": "wiki_outline" if is_outline else "wiki_section",
                    "is_navigation": is_outline,
                    "wiki_path": relative_path,
                    "wiki_title": document.title,
                    "wiki_tags": metadata_base.get("tags", []),
                    "wiki_related": metadata_base.get("related", []),
                    "wiki_links": document.links,
                    "source_raw_file": metadata_base.get("source"),
                    "reviewed_by": "wikidb",
                    "review_mode": "wiki_approved",
                    "review_action": "approve",
                    "review_note": "",
                },
            )
            digest = sha1(f"{source}:{source_locator}:{block_text}".encode("utf-8")).hexdigest()
            blocks.append(
                PendingReviewKnowledgeBlock(
                    id=digest,
                    text=block_text,
                    metadata=metadata,
                    status="approved",
                    title=section.title or document.title,
                    section_path=section_path,
                    source_locator=source_locator,
                    char_count=len(block_text),
                )
            )
        return blocks


def build_wiki_approved_payload(blocks: list[PendingReviewKnowledgeBlock], *, root: Path) -> dict[str, Any]:
    return {
        "source": "wikidb",
        "input_path": str(root),
        "status": "approved",
        "block_count": len(blocks),
        "blocks": [asdict(block) for block in blocks],
        "review_summary": {
            "mode": "wiki_approved",
            "reviewer": "wikidb",
            "approved_count": len(blocks),
            "rejected_count": 0,
            "edited_count": 0,
            "skipped_count": 0,
        },
    }


def _metadata_values(metadata: dict[str, Any]) -> dict[str, Any]:
    values = dict(metadata)
    for key in ("tags", "related"):
        value = values.get(key)
        if value is None:
            values[key] = []
        elif not isinstance(value, list):
            values[key] = [str(value)]
        else:
            values[key] = [str(item) for item in value]
    if "date" in values:
        values["date"] = str(values["date"])
    if "source" in values:
        values["source"] = str(values["source"])
    return values
