from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha1
import json
import re
from pathlib import Path
from typing import Any
from xml.etree import ElementTree
from zipfile import ZipFile

from .schemas import KnowledgeMetadata, KnowledgeType, PendingReviewKnowledgeBlock


WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
PARAGRAPH_TAG = f"{W_NS}p"
TABLE_TAG = f"{W_NS}tbl"
SDT_TAG = f"{W_NS}sdt"
SDT_CONTENT_TAG = f"{W_NS}sdtContent"
TEXT_TAG = f"{W_NS}t"
TAB_TAG = f"{W_NS}tab"
BREAK_TAG = f"{W_NS}br"
CR_TAG = f"{W_NS}cr"

FRONT_MATTER_HEADINGS = {"前言", "引言"}


@dataclass(slots=True)
class DocumentTextBlock:
    index: int
    text: str
    kind: str
    section_path: list[str]


@dataclass(slots=True)
class CleaningSummary:
    source: str
    input_path: str
    block_count: int
    output_path: str | None = None


class DocxTextExtractor:
    """Extracts ordered text blocks from a .docx package using only stdlib XML tools."""

    def extract(self, path: str | Path) -> list[DocumentTextBlock]:
        docx_path = Path(path)
        if docx_path.suffix.lower() != ".docx":
            raise ValueError(f"Expected a .docx file, got: {docx_path}")
        if docx_path.name.startswith("~$"):
            raise ValueError(f"Refusing to read Word temporary lock file: {docx_path}")
        if not docx_path.exists():
            raise FileNotFoundError(docx_path)

        with ZipFile(docx_path) as archive:
            document_xml = archive.read("word/document.xml")
            style_heading_levels = _read_style_heading_levels(archive)
            style_body_number_levels = _read_style_body_number_levels(archive)

        root = ElementTree.fromstring(document_xml)
        body = root.find("w:body", WORD_NS)
        if body is None:
            return []

        blocks: list[DocumentTextBlock] = []
        section_path: list[str] = []
        heading_numbers = [0] * 6
        in_toc = False
        for child in _iter_body_blocks(body):
            if child.tag == PARAGRAPH_TAG:
                text = _normalize_text(_paragraph_text(child))
                if not text:
                    continue
                if _is_toc_title(text):
                    in_toc = True
                    continue
                if in_toc:
                    if _looks_like_toc_entry(text):
                        continue
                    in_toc = False

                style_heading_level = _style_heading_level(child, style_heading_levels)
                heading_level = (
                    style_heading_level
                    or _heading_level(child)
                    or _numbered_heading_level(text)
                    or _front_matter_heading_level(text)
                )
                if heading_level is not None:
                    heading_text = _section_heading_text(
                        text,
                        heading_level,
                        heading_numbers,
                        auto_number=style_heading_level is not None,
                    )
                    section_path = section_path[: heading_level - 1]
                    section_path.append(heading_text)
                    continue
                text = _numbered_body_text(child, text, style_body_number_levels, heading_numbers)
                blocks.append(
                    DocumentTextBlock(
                        index=len(blocks),
                        text=text,
                        kind="paragraph",
                        section_path=list(section_path),
                    )
                )
            elif child.tag == TABLE_TAG:
                for row_text in _table_row_texts(child):
                    text = _normalize_text(row_text)
                    if not text:
                        continue
                    if in_toc:
                        if _looks_like_toc_entry(text):
                            continue
                        in_toc = False
                    blocks.append(
                        DocumentTextBlock(
                            index=len(blocks),
                            text=text,
                            kind="table_row",
                            section_path=list(section_path),
                        )
                    )
        return blocks


class KnowledgeCleaningPipeline:
    """Turns source documents into reviewable knowledge blocks without writing vectors."""

    def __init__(
        self,
        *,
        extractor: DocxTextExtractor | None = None,
        chunk_size: int = 900,
        overlap: int = 120,
    ) -> None:
        if chunk_size <= 0:
            raise ValueError("chunk_size must be greater than 0")
        if overlap < 0 or overlap >= chunk_size:
            raise ValueError("overlap must be greater than or equal to 0 and less than chunk_size")
        self.extractor = extractor or DocxTextExtractor()
        self.chunk_size = chunk_size
        self.overlap = overlap

    def clean_docx(
        self,
        path: str | Path,
        *,
        source: str | None = None,
        knowledge_type: KnowledgeType = "process_doc",
        agent_scope: list[str] | None = None,
        process_areas: list[str] | None = None,
        device_ids: list[str] | None = None,
        incident_types: list[str] | None = None,
        source_version: str | None = None,
        safety_level: str | None = None,
        effective_time: str | None = None,
        extra_metadata: dict[str, Any] | None = None,
    ) -> list[PendingReviewKnowledgeBlock]:
        docx_path = Path(path)
        source_name = source or docx_path.name
        text_blocks = self.extractor.extract(docx_path)
        pending: list[PendingReviewKnowledgeBlock] = []

        for text_block in text_blocks:
            for chunk_index, chunk_text in enumerate(self._split_text(text_block.text)):
                section_path = list(text_block.section_path)
                title = section_path[-1] if section_path else None
                source_locator = f"{docx_path.as_posix()}#block-{text_block.index + 1}"
                if chunk_index:
                    source_locator = f"{source_locator}.{chunk_index + 1}"
                metadata = KnowledgeMetadata(
                    source=source_name,
                    knowledge_type=knowledge_type,
                    agent_scope=list(agent_scope or []),
                    process_areas=list(process_areas or []),
                    device_ids=list(device_ids or []),
                    incident_types=list(incident_types or []),
                    source_version=source_version,
                    safety_level=safety_level,
                    effective_time=effective_time,
                    extra={
                        "document_kind": "docx",
                        "block_kind": text_block.kind,
                        **(extra_metadata or {}),
                    },
                )
                digest = sha1(f"{source_name}:{source_locator}:{chunk_text}".encode("utf-8")).hexdigest()
                pending.append(
                    PendingReviewKnowledgeBlock(
                        id=digest,
                        text=chunk_text,
                        metadata=metadata,
                        title=title,
                        section_path=section_path,
                        source_locator=source_locator,
                        char_count=len(chunk_text),
                    )
                )
        return pending

    def _split_text(self, text: str) -> list[str]:
        normalized = _normalize_text(text)
        if not normalized:
            return []
        if len(normalized) <= self.chunk_size:
            return [normalized]

        chunks: list[str] = []
        step = self.chunk_size - self.overlap
        for start in range(0, len(normalized), step):
            chunk = normalized[start : start + self.chunk_size].strip()
            if chunk:
                chunks.append(chunk)
        return chunks


def write_pending_blocks_json(
    blocks: list[PendingReviewKnowledgeBlock],
    output_path: str | Path,
    *,
    source: str,
    input_path: str | Path,
) -> CleaningSummary:
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": source,
        "input_path": str(input_path),
        "status": "pending_review",
        "block_count": len(blocks),
        "blocks": [asdict(block) for block in blocks],
    }
    destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return CleaningSummary(
        source=source,
        input_path=str(input_path),
        block_count=len(blocks),
        output_path=str(destination),
    )


def _iter_body_blocks(element: ElementTree.Element) -> list[ElementTree.Element]:
    blocks: list[ElementTree.Element] = []
    for child in element:
        if child.tag in {PARAGRAPH_TAG, TABLE_TAG}:
            blocks.append(child)
        elif child.tag == SDT_TAG:
            content = child.find("w:sdtContent", WORD_NS)
            if content is not None:
                blocks.extend(_iter_body_blocks(content))
        elif child.tag == SDT_CONTENT_TAG:
            blocks.extend(_iter_body_blocks(child))
    return blocks


def _read_style_heading_levels(archive: ZipFile) -> dict[str, int]:
    try:
        styles_xml = archive.read("word/styles.xml")
    except KeyError:
        return {}

    root = ElementTree.fromstring(styles_xml)
    style_levels: dict[str, int] = {}
    for style in root.findall("w:style", WORD_NS):
        style_id = style.attrib.get(f"{W_NS}styleId")
        if not style_id:
            continue

        name_element = style.find("w:name", WORD_NS)
        style_name = name_element.attrib.get(f"{W_NS}val", "") if name_element is not None else ""
        if not _style_name_looks_like_heading(style_name):
            continue

        outline = style.find("./w:pPr/w:outlineLvl", WORD_NS)
        if outline is None:
            continue
        outline_value = outline.attrib.get(f"{W_NS}val")
        if outline_value is None or not outline_value.isdigit():
            continue

        level = int(outline_value) + 1
        if 1 <= level <= 2:
            style_levels[style_id] = level
    return style_levels


def _read_style_body_number_levels(archive: ZipFile) -> dict[str, int]:
    try:
        styles_xml = archive.read("word/styles.xml")
        numbering_xml = archive.read("word/numbering.xml")
    except KeyError:
        return {}

    styles_root = ElementTree.fromstring(styles_xml)
    numbering_root = ElementTree.fromstring(numbering_xml)
    style_bases = _read_style_bases(styles_root)
    direct_levels: dict[str, int] = {}

    for level in numbering_root.findall(".//w:lvl", WORD_NS):
        style = level.find("w:pStyle", WORD_NS)
        if style is None:
            continue
        style_id = style.attrib.get(f"{W_NS}val")
        level_value = level.attrib.get(f"{W_NS}ilvl")
        if not style_id or level_value is None or not level_value.isdigit():
            continue

        section_level = int(level_value)
        if 3 <= section_level <= 6:
            direct_levels[style_id] = section_level

    style_levels: dict[str, int] = {}
    for style in styles_root.findall("w:style", WORD_NS):
        style_id = style.attrib.get(f"{W_NS}styleId")
        if not style_id:
            continue
        level = _resolve_style_level(style_id, direct_levels, style_bases)
        if level is not None:
            style_levels[style_id] = level
    return style_levels


def _read_style_bases(styles_root: ElementTree.Element) -> dict[str, str]:
    style_bases: dict[str, str] = {}
    for style in styles_root.findall("w:style", WORD_NS):
        style_id = style.attrib.get(f"{W_NS}styleId")
        based_on = style.find("w:basedOn", WORD_NS)
        base_id = based_on.attrib.get(f"{W_NS}val") if based_on is not None else None
        if style_id and base_id:
            style_bases[style_id] = base_id
    return style_bases


def _resolve_style_level(
    style_id: str,
    direct_levels: dict[str, int],
    style_bases: dict[str, str],
) -> int | None:
    current = style_id
    seen: set[str] = set()
    while current and current not in seen:
        seen.add(current)
        if current in direct_levels:
            return direct_levels[current]
        current = style_bases.get(current, "")
    return None


def _style_name_looks_like_heading(style_name: str) -> bool:
    normalized = style_name.strip().lower()
    if not normalized or normalized.startswith("toc"):
        return False
    return bool(re.search(r"heading\s*[1-6]", normalized)) or "标题" in style_name or "標題" in style_name


def _paragraph_text(paragraph: ElementTree.Element) -> str:
    pieces: list[str] = []
    for node in paragraph.iter():
        if node.tag == TEXT_TAG:
            pieces.append(node.text or "")
        elif node.tag == TAB_TAG:
            pieces.append(" ")
        elif node.tag in {BREAK_TAG, CR_TAG}:
            pieces.append("\n")
    return "".join(pieces)


def _table_row_texts(table: ElementTree.Element) -> list[str]:
    rows: list[str] = []
    for row in table.findall("w:tr", WORD_NS):
        cells: list[str] = []
        for cell in row.findall("w:tc", WORD_NS):
            text = _normalize_text(" ".join(_paragraph_text(p) for p in cell.findall("w:p", WORD_NS)))
            if text:
                cells.append(text)
        if cells:
            rows.append(" | ".join(cells))
    return rows


def _heading_level(paragraph: ElementTree.Element) -> int | None:
    style = paragraph.find("./w:pPr/w:pStyle", WORD_NS)
    if style is None:
        return None
    value = style.attrib.get(f"{W_NS}val", "")
    match = re.search(r"(?:Heading|Title|标题)\s*([1-6])", value, flags=re.IGNORECASE)
    if match is None:
        return None
    return int(match.group(1))


def _style_heading_level(paragraph: ElementTree.Element, style_heading_levels: dict[str, int]) -> int | None:
    style = paragraph.find("./w:pPr/w:pStyle", WORD_NS)
    if style is None:
        return None
    value = style.attrib.get(f"{W_NS}val", "")
    return style_heading_levels.get(value)


def _numbered_body_text(
    paragraph: ElementTree.Element,
    text: str,
    style_body_number_levels: dict[str, int],
    heading_numbers: list[int],
) -> str:
    style = paragraph.find("./w:pPr/w:pStyle", WORD_NS)
    if style is None:
        return text

    level = style_body_number_levels.get(style.attrib.get(f"{W_NS}val", ""))
    if level is None or _has_visible_list_marker(text):
        return text

    number = _next_heading_number(level, heading_numbers)
    return f"{number} {text}" if number else text


def _has_visible_list_marker(text: str) -> bool:
    return bool(
        re.match(
            r"^(?:\d+(?:\.\d+)*|[A-Za-z]|[a-z]|[一二三四五六七八九十]+)[)）\.、\s]",
            text.strip(),
        )
    )


def _section_heading_text(text: str, level: int, heading_numbers: list[int], *, auto_number: bool) -> str:
    if text in FRONT_MATTER_HEADINGS:
        return text

    explicit_number = _leading_heading_number(text)
    if explicit_number is not None:
        _sync_heading_numbers(explicit_number, heading_numbers)
        return text

    if not auto_number:
        return text

    number = _next_heading_number(level, heading_numbers)
    return f"{number} {text}" if number else text


def _leading_heading_number(text: str) -> str | None:
    match = re.match(r"^(\d+(?:\.\d+)*)(?:\s+|(?=[^\d.\s]))", text)
    return match.group(1) if match is not None else None


def _sync_heading_numbers(number: str, heading_numbers: list[int]) -> None:
    parts = [int(part) for part in number.split(".") if part.isdigit()]
    for index, part in enumerate(parts[: len(heading_numbers)]):
        heading_numbers[index] = part
    for index in range(len(parts), len(heading_numbers)):
        heading_numbers[index] = 0


def _next_heading_number(level: int, heading_numbers: list[int]) -> str:
    if level < 1 or level > len(heading_numbers):
        return ""
    for index in range(level - 1):
        if heading_numbers[index] == 0:
            heading_numbers[index] = 1
    heading_numbers[level - 1] += 1
    for index in range(level, len(heading_numbers)):
        heading_numbers[index] = 0
    return ".".join(str(number) for number in heading_numbers[:level] if number > 0)


def _numbered_heading_level(text: str) -> int | None:
    match = re.match(r"^(\d+(?:\.\d+)*)(?:\s+|(?=[^\d.\s]))(.+)$", text)
    if match is None:
        return None

    number, title = match.groups()
    parts = number.split(".")
    if len(parts) > 2:
        return None
    if not _looks_like_heading_title(title):
        return None
    return len(parts)


def _front_matter_heading_level(text: str) -> int | None:
    return 1 if text in FRONT_MATTER_HEADINGS else None


def _looks_like_heading_title(title: str) -> bool:
    compact = title.strip()
    if not compact:
        return False
    if len(compact) > 40:
        return False
    if re.search(r"[。；;：:，,、.!?？]", compact):
        return False
    return True


def _is_toc_title(text: str) -> bool:
    return text.strip() in {"目次", "目录"}


def _looks_like_toc_entry(text: str) -> bool:
    compact = re.sub(r"\s+", " ", text).strip()
    if not compact:
        return False
    if _is_toc_title(compact):
        return True

    page_number = r"(?:\d+|[IVXLCDM]+)"
    dotted = rf"^(?:\d+(?:\.\d+)*|附录\s*[A-Z]|前言|引言)\s+.+(?:\.{{2,}}|…+|·+)\s*{page_number}$"
    spaced = rf"^(?:\d+(?:\.\d+)*|附录\s*[A-Z])\s+.+\s+{page_number}$"
    front_spaced = rf"^(?:前言|引言)\s+{page_number}$"
    joined = rf"^(?:前言|引言){page_number}$|^\d+(?:\.\d+)*(?:\s+|(?=[^\d.\s]))\D.+{page_number}$"
    return any(
        re.match(pattern, compact, flags=re.IGNORECASE)
        for pattern in (dotted, spaced, front_spaced, joined)
    )


def _normalize_text(text: str) -> str:
    cleaned = text.replace("\u00a0", " ").replace("\u3000", " ")
    cleaned = re.sub(r"[ \t\r\f\v]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()
