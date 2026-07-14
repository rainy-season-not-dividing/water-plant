from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any


FRONT_MATTER_BOUNDARY = "---"
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
WIKI_LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")


@dataclass(slots=True)
class WikiSection:
    title: str | None
    level: int
    section_path: list[str]
    text: str


@dataclass(slots=True)
class WikiDocument:
    title: str
    metadata: dict[str, Any]
    sections: list[WikiSection]
    links: list[str] = field(default_factory=list)


def parse_wiki_markdown(text: str, *, fallback_title: str) -> WikiDocument:
    text = text.lstrip("\ufeff")
    metadata, body = _split_front_matter(text)
    title = str(metadata.get("title") or fallback_title)
    sections = _parse_sections(body)
    links = sorted(set(_extract_wiki_links(text)))
    return WikiDocument(title=title, metadata=metadata, sections=sections, links=links)


def _split_front_matter(text: str) -> tuple[dict[str, Any], str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != FRONT_MATTER_BOUNDARY:
        return {}, text

    end_index = None
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == FRONT_MATTER_BOUNDARY:
            end_index = index
            break
    if end_index is None:
        return {}, text

    metadata = _parse_simple_yaml(lines[1:end_index])
    body = "\n".join(lines[end_index + 1 :])
    return metadata, body


def _parse_simple_yaml(lines: list[str]) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or ":" not in stripped:
            continue
        key, raw_value = stripped.split(":", 1)
        key = key.strip()
        value = raw_value.strip()
        metadata[key] = _parse_yaml_value(value)
    return metadata


def _parse_yaml_value(value: str) -> Any:
    if not value:
        return ""
    wiki_links = [f"[[{match}]]" for match in WIKI_LINK_RE.findall(value)]
    if wiki_links:
        return wiki_links
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [_strip_quotes(part.strip()) for part in inner.split(",") if part.strip()]
    return _strip_quotes(value)


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def _parse_sections(body: str) -> list[WikiSection]:
    heading_stack: list[tuple[int, str]] = []
    current_title: str | None = None
    current_level = 0
    current_lines: list[str] = []
    sections: list[WikiSection] = []

    def flush() -> None:
        text = "\n".join(current_lines).strip()
        if not text:
            return
        sections.append(
            WikiSection(
                title=current_title,
                level=current_level,
                section_path=[title for _, title in heading_stack],
                text=text,
            )
        )

    for line in body.splitlines():
        match = HEADING_RE.match(line)
        if match:
            flush()
            level = len(match.group(1))
            title = match.group(2).strip()
            heading_stack[:] = [(existing_level, existing_title) for existing_level, existing_title in heading_stack if existing_level < level]
            heading_stack.append((level, title))
            current_title = title
            current_level = level
            current_lines = []
            continue
        current_lines.append(line)
    flush()

    if sections:
        return sections
    compact = body.strip()
    if not compact:
        return []
    return [WikiSection(title=None, level=0, section_path=[], text=compact)]


def _extract_wiki_links(text: str) -> list[str]:
    links: list[str] = []
    for match in WIKI_LINK_RE.finditer(text):
        target = match.group(1).split("|", 1)[0].strip()
        if target:
            links.append(target)
    return links
