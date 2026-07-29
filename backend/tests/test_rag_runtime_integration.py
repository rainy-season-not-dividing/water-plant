from __future__ import annotations

import asyncio
import json
import unittest
from unittest.mock import patch

from app.context.builder import build_analysis_user_message
from app.context.schemas import ContextPackage
from app.rag.schemas import KnowledgeChunk, KnowledgeMetadata, RetrievalRequest, RetrievalResponse, RetrievalResult
from app.rag.service import RagService
from app.safety.sandbox import build_sandbox_messages
from app.tools.rag_tools import RagEvidenceTool, RagRetrievalFailed, build_evidence_query


class RagRuntimeIntegrationTest(unittest.TestCase):
    def test_rag_service_disabled_returns_no_results(self) -> None:
        with patch.dict("os.environ", {"RAG_ENABLED": "false"}, clear=False):
            response = RagService().retrieve(RetrievalRequest(query="UF TMP", top_k=3))

        self.assertEqual(response.status, "disabled")
        self.assertEqual(response.results, [])

    def test_keyword_mode_uses_bm25_retriever(self) -> None:
        bm25 = _StaticRetriever([_retrieval_result("es-1", "ES BM25 命中。", locator="es/doc.md#section-1")])
        with patch.dict(
            "os.environ",
            {
                "RAG_ENABLED": "true",
                "RAG_RETRIEVAL_MODE": "keyword",
            },
            clear=False,
        ):
            response = RagService(bm25_retriever=bm25).retrieve(RetrievalRequest(query="UF TMP", top_k=3))

        self.assertEqual(response.status, "degraded_bm25_only")
        self.assertEqual(len(response.results), 1)
        self.assertEqual(response.results[0].chunk.metadata.extra["source_locator"], "es/doc.md#section-1")

    def test_rag_evidence_tool_builds_prompt_shadow_query(self) -> None:
        query = build_evidence_query(
            agent_id="uf",
            incident_type="uf_clogging",
            phase="agent",
            telemetry={"ufPressure": 460, "outletTurbidity": 1.4},
        )

        self.assertIn("uf_clogging", query)
        self.assertIn("ufPressure", query)
        self.assertIn("UF", query)
        self.assertIn("CIP", query)

    def test_analysis_user_message_appends_evidence_without_evidence_changing_legacy_text(self) -> None:
        base = ContextPackage(
            agent_id="uf",
            incident_type="uf_clogging",
            phase="agent",
            telemetry={"ufPressure": 460},
        )
        with_evidence = base.model_copy(
            update={
                "rag_evidence": [
                    {
                        "text": "UF TMP 升高时不得直接跳到 CIP。",
                        "source_locator": "wiki/UF处置顺序.md#section-1",
                    }
                ]
            }
        )

        legacy_message = build_analysis_user_message(base)
        evidence_message = build_analysis_user_message(with_evidence)

        self.assertNotIn("参考知识证据", legacy_message)
        self.assertIn("参考知识证据", evidence_message)
        self.assertIn("wiki/UF处置顺序.md#section-1", evidence_message)

    def test_sandbox_message_appends_safety_evidence(self) -> None:
        _, message = build_sandbox_messages(
            "ro_fouling",
            {"roTds": 320},
            rag_evidence=[
                {
                    "text": "AI 副驾驶不能自动下发 PLC。",
                    "source_locator": "wiki/AI副驾驶权限边界.md#section-1",
                }
            ],
        )

        self.assertIn("参考安全知识证据", message)
        self.assertIn("wiki/AI副驾驶权限边界.md#section-1", message)

    def test_rag_evidence_tool_returns_evidence_dicts(self) -> None:
        fake_service = _FakeRagService(
            RetrievalResponse(
                status="hybrid",
                results=[_retrieval_result("chunk-1", "加药异常必须区分 UF 清洗加药域和 RO 保护加药域。")],
            )
        )
        with patch("app.tools.rag_tools.rag_service", fake_service):
            evidence = RagEvidenceTool().call(
                agent_id="dosing",
                incident_type="dosing_abnormal",
                phase="agent",
                telemetry={"dosingRate": 2.8},
                top_k=3,
            )

        self.assertEqual(len(evidence), 1)
        self.assertEqual(evidence[0]["source_locator"], "wiki/加药分域.md#section-1")

    def test_rag_evidence_tool_raises_when_retrieval_failed(self) -> None:
        fake_service = _FakeRagService(
            RetrievalResponse(
                status="failed",
                failed_sources=["bm25", "vector"],
                errors={"bm25": "down", "vector": "down"},
            )
        )
        with patch("app.tools.rag_tools.rag_service", fake_service):
            with self.assertRaises(RagRetrievalFailed):
                RagEvidenceTool().call(agent_id="dosing", incident_type="dosing_abnormal", phase="agent")

    def test_stream_analysis_returns_error_when_rag_failed_without_calling_llm(self) -> None:
        from app.workflows.decision_chain import stream_legacy_phase_analysis

        response = RetrievalResponse(
            status="failed",
            failed_sources=["bm25", "vector"],
            errors={"bm25": "down", "vector": "down"},
        )
        with (
            patch("app.workflows.decision_chain.rag_evidence_tool", _FailingRagEvidenceTool(response)),
            patch("app.workflows.decision_chain.stream_chat") as stream_chat,
        ):
            events = asyncio.run(
                _collect_async(
                    stream_legacy_phase_analysis(
                        incident_type="dosing_abnormal",
                        phase="agent",
                        telemetry={"dosingRate": 2.8},
                    )
                )
            )

        payload = json.loads(events[0])
        self.assertEqual(payload["type"], "error")
        self.assertEqual(payload["ragStatus"], "failed")
        self.assertEqual(payload["failedSources"], ["bm25", "vector"])
        stream_chat.assert_not_called()


class _StaticRetriever:
    def __init__(self, results: list[RetrievalResult]) -> None:
        self.results = results

    def retrieve(self, request: RetrievalRequest) -> list[RetrievalResult]:
        return self.results[: request.top_k]


class _FakeRagService:
    def __init__(self, response: RetrievalResponse) -> None:
        self.response = response

    def retrieve(self, request: RetrievalRequest) -> RetrievalResponse:
        return self.response


class _FailingRagEvidenceTool:
    def __init__(self, response: RetrievalResponse) -> None:
        self.response = response

    def call_with_status(self, **kwargs):
        raise RagRetrievalFailed(self.response)


def _retrieval_result(chunk_id: str, text: str, *, locator: str = "wiki/加药分域.md#section-1") -> RetrievalResult:
    return RetrievalResult(
        chunk=KnowledgeChunk(
            id=chunk_id,
            text=text,
            metadata=KnowledgeMetadata(
                source="wikidb:wiki/加药分域.md",
                knowledge_type="process_doc",
                extra={"source_locator": locator},
            ),
        ),
        score=0.9,
        rank=1,
    )


async def _collect_async(generator) -> list[str]:
    return [event async for event in generator]


if __name__ == "__main__":
    unittest.main()
