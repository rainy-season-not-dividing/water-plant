from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict, is_dataclass
import re
from typing import Any

from ..ingestion import PlannedEmbeddingChunk, dry_run_approved_payload
from ..schemas import KnowledgeChunk, KnowledgeMetadata, RetrievalRequest, RetrievalResult


TOKEN_RE = re.compile(r"[A-Za-z0-9_\-]+|[\u4e00-\u9fff]{2,}")
CJK_RE = re.compile(r"[\u4e00-\u9fff]+")
QUESTION_STOP_PHRASES = (
    "是什么",
    "为什么",
    "什么",
    "可能",
    "原因",
    "关系",
    "怎么",
    "如何",
    "有哪些",
    "多少",
    "是否",
    "请问",
    "一下",
    "以及",
    "和",
    "与",
    "的",
)
NAVIGATION_QUERY_TERMS = {"index", "目录", "索引", "导航", "outline"}


class KeywordRetriever:
    """Deterministic keyword retriever over approved planned chunks."""

    def __init__(self, chunks: Sequence[PlannedEmbeddingChunk]) -> None:
        self.chunks = list(chunks)

    @classmethod
    def from_approved_payload(cls, payload: dict[str, Any]) -> "KeywordRetriever":
        chunks = dry_run_approved_payload(payload)[0]
        return cls(chunks)

    def retrieve(self, request: RetrievalRequest) -> list[RetrievalResult]:
        scored: list[tuple[float, PlannedEmbeddingChunk]] = []
        for chunk in self.chunks:
            if not _matches_filters(chunk.metadata, request):
                continue
            score = _keyword_score(request.query, chunk)
            if score > 0:
                scored.append((score, chunk))
        scored.sort(key=lambda item: (-item[0], item[1].id))
        return [
            RetrievalResult(
                chunk=_knowledge_chunk_from_planned(chunk),
                score=score,
                rank=index,
            )
            for index, (score, chunk) in enumerate(scored[: request.top_k], start=1)
        ]


def _keyword_score(query: str, chunk: PlannedEmbeddingChunk) -> float:
    normalized_query = query.strip().lower()
    if not normalized_query:
        return 0.0
    if _is_navigation_chunk(chunk) and not _is_navigation_query(normalized_query):
        return 0.0

    fields = {
        "title": str(chunk.metadata.get("title") or "").lower(),
        "section_path": " ".join(str(item) for item in chunk.metadata.get("section_path") or []).lower(),
        "source": str(chunk.metadata.get("source") or "").lower(),
        "locator": str(chunk.metadata.get("source_locator") or "").lower(),
        "body": "\n".join([chunk.text_for_embedding, chunk.display_text]).lower(),
    }
    haystack = "\n".join(fields.values())

    score = 0.0
    if normalized_query in haystack:
        score += 5.0 + min(5, haystack.count(normalized_query))
    for term in _query_terms(normalized_query):
        score += _term_score(term, fields)
    return score


def _query_terms(query: str) -> list[str]:
    tokens = [match.group(0).lower() for match in TOKEN_RE.finditer(query)]
    terms: list[str] = []
    for token in tokens:
        if _is_noise_term(token):
            continue
        terms.append(token)
        if CJK_RE.fullmatch(token):
            cleaned = _strip_question_phrases(token)
            if cleaned and cleaned != token and not _is_noise_term(cleaned):
                terms.append(cleaned)
            terms.extend(_cjk_ngrams(cleaned or token))
    if not terms:
        terms = [query]
    return sorted(set(terms), key=terms.index)


def _strip_question_phrases(value: str) -> str:
    cleaned = value
    for phrase in QUESTION_STOP_PHRASES:
        cleaned = cleaned.replace(phrase, " ")
    return "".join(cleaned.split())


def _cjk_ngrams(value: str) -> list[str]:
    if len(value) < 2:
        return []
    grams: list[str] = []
    for size in (4, 3, 2):
        if len(value) < size:
            continue
        for start in range(0, len(value) - size + 1):
            gram = value[start : start + size]
            if not _is_noise_term(gram):
                grams.append(gram)
    return grams


def _is_noise_term(value: str) -> bool:
    stripped = value.strip().lower()
    return not stripped or stripped in QUESTION_STOP_PHRASES or len(stripped) <= 1


def _term_score(term: str, fields: dict[str, str]) -> float:
    score = 0.0
    weights = {
        "title": 6.0,
        "section_path": 4.0,
        "locator": 3.0,
        "source": 2.0,
        "body": 1.0,
    }
    for name, text in fields.items():
        occurrences = text.count(term)
        if occurrences:
            score += weights[name] + min(occurrences, 5) * 0.25
    return score


def _is_navigation_chunk(chunk: PlannedEmbeddingChunk) -> bool:
    block_kind = str(chunk.metadata.get("block_kind") or "")
    locator = str(chunk.metadata.get("source_locator") or "").lower()
    title = str(chunk.metadata.get("title") or "").lower()
    return block_kind == "wiki_outline" or locator.startswith("wiki/index.md") or title == "index"


def _is_navigation_query(query: str) -> bool:
    return any(term in query for term in NAVIGATION_QUERY_TERMS)


def _matches_filters(metadata: dict[str, Any], request: RetrievalRequest) -> bool:
    if request.agent_id and request.agent_id not in _list(metadata.get("agent_scope")):
        return False
    if request.knowledge_types and metadata.get("knowledge_type") not in request.knowledge_types:
        return False
    if request.process_areas and not set(request.process_areas).intersection(_list(metadata.get("process_areas"))):
        return False
    if request.device_ids and not set(request.device_ids).intersection(_list(metadata.get("device_ids"))):
        return False
    if request.incident_types and not set(request.incident_types).intersection(_list(metadata.get("incident_types"))):
        return False
    return True


def _knowledge_chunk_from_planned(chunk: PlannedEmbeddingChunk) -> KnowledgeChunk:
    metadata = chunk.metadata
    known = {
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
    extra = {key: value for key, value in metadata.items() if key not in known}
    return KnowledgeChunk(
        id=chunk.id,
        text=chunk.display_text,
        metadata=KnowledgeMetadata(
            source=str(metadata.get("source") or ""),
            knowledge_type=metadata.get("knowledge_type") or "process_doc",
            agent_scope=_list(metadata.get("agent_scope")),
            process_areas=_list(metadata.get("process_areas")),
            device_ids=_list(metadata.get("device_ids")),
            incident_types=_list(metadata.get("incident_types")),
            source_version=metadata.get("source_version"),
            safety_level=metadata.get("safety_level"),
            effective_time=metadata.get("effective_time"),
            extra=extra,
        ),
    )


def _list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def result_to_dict(result: RetrievalResult) -> dict[str, Any]:
    metadata = result.chunk.metadata
    metadata_dict = asdict(metadata) if is_dataclass(metadata) else dict(metadata)
    return {
        "rank": result.rank,
        "score": result.score,
        "chunk_id": result.chunk.id,
        "text": result.chunk.text,
        **metadata_dict,
    }
