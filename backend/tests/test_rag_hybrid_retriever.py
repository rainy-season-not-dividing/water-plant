from __future__ import annotations

import unittest

from app.rag.ingestion import PlannedEmbeddingChunk
from app.rag.retrievers.hybrid import HybridRetriever
from app.rag.retrievers.keyword import KeywordRetriever
from app.rag.schemas import KnowledgeChunk, KnowledgeMetadata, RetrievalRequest, RetrievalResult


class RagHybridRetrieverTest(unittest.TestCase):
    def test_keyword_retriever_returns_matching_chunks(self) -> None:
        retriever = KeywordRetriever([_planned_chunk("chunk-1", "PAC 投加需要结合浊度变化。")])

        results = retriever.retrieve(RetrievalRequest(query="PAC 浊度", top_k=3))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].chunk.id, "chunk-1")
        self.assertEqual(results[0].chunk.metadata.extra["source_locator"], "wiki/药剂策略.md#section-1")

    def test_keyword_retriever_extracts_core_chinese_terms(self) -> None:
        retriever = KeywordRetriever(
            [
                _planned_chunk(
                    "chunk-1",
                    "浊度升高\n\n- 可能原因：原水浊度骤升；混凝剂投加量不足或过量。",
                    title="浊度升高",
                    section_path=["浊度升高", "浊度升高"],
                    locator="wiki/浊度升高.md#section-2",
                )
            ]
        )

        results = retriever.retrieve(RetrievalRequest(query="浊度升高可能是什么原因？", top_k=3))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].chunk.id, "chunk-1")

    def test_keyword_retriever_skips_outline_for_regular_queries(self) -> None:
        retriever = KeywordRetriever(
            [
                _planned_chunk(
                    "outline",
                    "浊度是核心指标。",
                    title="INDEX",
                    section_path=["INDEX"],
                    locator="wiki/INDEX.md#section-1",
                    block_kind="wiki_outline",
                ),
                _planned_chunk(
                    "chunk-1",
                    "浊度升高的可能原因包括混凝剂投加不足。",
                    title="浊度升高",
                    section_path=["浊度升高"],
                    locator="wiki/浊度升高.md#section-2",
                ),
            ]
        )

        results = retriever.retrieve(RetrievalRequest(query="浊度升高原因", top_k=3))

        self.assertEqual([result.chunk.id for result in results], ["chunk-1"])

    def test_hybrid_retriever_fuses_bm25_and_vector_results(self) -> None:
        bm25 = _StaticRetriever(
            [
                RetrievalResult(
                    chunk=_chunk("chunk-1", "PAC 投加需要结合浊度变化。"),
                    score=7.0,
                    rank=1,
                )
            ]
        )
        vector = _StaticRetriever(
            [
                RetrievalResult(
                    chunk=_chunk("chunk-2", "超滤反洗周期需要参考跨膜压差。"),
                    score=0.9,
                    rank=1,
                ),
                RetrievalResult(
                    chunk=_chunk("chunk-1", "PAC 投加需要结合浊度变化。"),
                    score=0.8,
                    rank=2,
                ),
            ]
        )

        response = HybridRetriever(bm25_retriever=bm25, vector_retriever=vector).retrieve(
            RetrievalRequest(query="PAC 浊度", top_k=2)
        )

        self.assertEqual(response.status, "hybrid")
        results = response.results
        self.assertEqual([result.chunk.id for result in results], ["chunk-1", "chunk-2"])
        self.assertEqual(results[0].chunk.metadata.extra["retrieval_sources"], ["bm25", "vector"])

    def test_hybrid_retriever_degrades_to_vector_when_bm25_fails(self) -> None:
        bm25 = _FailingRetriever()
        vector = _StaticRetriever(
            [
                RetrievalResult(
                    chunk=_chunk("chunk-2", "超滤反洗周期需要参考跨膜压差。"),
                    score=0.9,
                    rank=1,
                )
            ]
        )

        response = HybridRetriever(bm25_retriever=bm25, vector_retriever=vector).retrieve(
            RetrievalRequest(query="超滤反洗", top_k=2)
        )

        self.assertEqual(response.status, "degraded_vector_only")
        self.assertEqual(response.failed_sources, ["bm25"])
        self.assertEqual([result.chunk.id for result in response.results], ["chunk-2"])

    def test_hybrid_retriever_degrades_to_bm25_when_vector_fails(self) -> None:
        bm25 = _StaticRetriever(
            [
                RetrievalResult(
                    chunk=_chunk("chunk-1", "PAC 投加需要结合浊度变化。"),
                    score=7.0,
                    rank=1,
                )
            ]
        )
        vector = _FailingRetriever()

        response = HybridRetriever(bm25_retriever=bm25, vector_retriever=vector).retrieve(
            RetrievalRequest(query="PAC 浊度", top_k=2)
        )

        self.assertEqual(response.status, "degraded_bm25_only")
        self.assertEqual(response.failed_sources, ["vector"])
        self.assertEqual([result.chunk.id for result in response.results], ["chunk-1"])

    def test_hybrid_retriever_reports_failed_when_both_branches_fail(self) -> None:
        response = HybridRetriever(
            bm25_retriever=_FailingRetriever(),
            vector_retriever=_FailingRetriever(),
        ).retrieve(RetrievalRequest(query="PAC 浊度", top_k=2))

        self.assertEqual(response.status, "failed")
        self.assertEqual(response.results, [])
        self.assertEqual(response.failed_sources, ["bm25", "vector"])

    def test_hybrid_retriever_reports_no_results(self) -> None:
        response = HybridRetriever(
            bm25_retriever=_StaticRetriever([]),
            vector_retriever=_StaticRetriever([]),
        ).retrieve(RetrievalRequest(query="PAC 浊度", top_k=2))

        self.assertEqual(response.status, "no_results")
        self.assertEqual(response.results, [])


class _StaticRetriever:
    def __init__(self, results: list[RetrievalResult]) -> None:
        self.results = results

    def retrieve(self, request: RetrievalRequest) -> list[RetrievalResult]:
        return self.results[: request.top_k]


class _FailingRetriever:
    def retrieve(self, request: RetrievalRequest) -> list[RetrievalResult]:
        raise RuntimeError("branch unavailable")


def _planned_chunk(
    chunk_id: str,
    text: str,
    *,
    title: str = "PAC",
    section_path: list[str] | None = None,
    locator: str = "wiki/药剂策略.md#section-1",
    block_kind: str = "wiki_section",
) -> PlannedEmbeddingChunk:
    section_path = section_path or ["药剂策略", "PAC"]
    return PlannedEmbeddingChunk(
        id=chunk_id,
        chunk_type="content_chunk",
        text_for_embedding=f"{' / '.join(section_path)}\n{text}",
        display_text=text,
        metadata={
            "approved_block_id": "block-1",
            "source": "wikidb:wiki/药剂策略.md",
            "knowledge_type": "process_doc",
            "agent_scope": [],
            "process_areas": [],
            "device_ids": [],
            "incident_types": [],
            "source_version": "2026-07-14",
            "safety_level": None,
            "effective_time": "2026-07-14",
            "title": title,
            "section_path": section_path,
            "source_locator": locator,
            "block_kind": block_kind,
        },
        char_count=len(text),
    )


def _chunk(chunk_id: str, text: str) -> KnowledgeChunk:
    return KnowledgeChunk(
        id=chunk_id,
        text=text,
        metadata=KnowledgeMetadata(source="wikidb:wiki/药剂策略.md", knowledge_type="process_doc"),
    )


if __name__ == "__main__":
    unittest.main()
