from __future__ import annotations

from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app.context.builder import build_analysis_user_message
from app.context.schemas import ContextPackage
from app.rag.schemas import RetrievalRequest
from app.rag.service import RagService
from app.safety.sandbox import build_sandbox_messages
from app.tools.rag_tools import RagEvidenceTool, build_evidence_query


class RagRuntimeIntegrationTest(unittest.TestCase):
    def test_rag_service_disabled_returns_no_results(self) -> None:
        with patch.dict("os.environ", {"RAG_ENABLED": "false"}, clear=False):
            results = RagService().retrieve(RetrievalRequest(query="UF TMP", top_k=3))

        self.assertEqual(results, [])

    def test_keyword_runtime_retrieval_reads_wiki_source(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            wiki_dir = root / "wiki"
            wiki_dir.mkdir()
            (wiki_dir / "UF处置顺序.md").write_text(
                """---
tags: [超滤, uf_clogging]
date: 2026-07-18
source: raw/旧系统prompt-UF处置顺序.md
related: [[CIP触发边界]]
---
UF TMP 升高时，应先复核上游来水和自清洗过滤器，再评估物理反洗、CEB/CED，长期无效后才进入 CIP 评估。
""",
                encoding="utf-8",
            )

            with patch.dict(
                "os.environ",
                {
                    "RAG_ENABLED": "true",
                    "RAG_RETRIEVAL_MODE": "keyword",
                    "RAG_WIKIDB_ROOT": str(root),
                    "RAG_LEGACY_WIKI_KEYWORD": "true",
                },
                clear=False,
            ):
                results = RagService().retrieve(RetrievalRequest(query="uf_clogging UF TMP CIP", top_k=3))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].chunk.metadata.extra["source_locator"], "wiki/UF处置顺序.md#section-1")

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
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            wiki_dir = root / "wiki"
            wiki_dir.mkdir()
            (wiki_dir / "加药分域.md").write_text(
                """---
tags: [加药, dosing_abnormal]
date: 2026-07-18
source: raw/旧系统prompt-加药分域与药剂风险.md
---
加药异常必须区分 UF 清洗加药域和 RO 保护加药域。
""",
                encoding="utf-8",
            )
            with patch.dict(
                "os.environ",
                {
                    "RAG_ENABLED": "true",
                    "RAG_RETRIEVAL_MODE": "keyword",
                    "RAG_WIKIDB_ROOT": str(root),
                    "RAG_LEGACY_WIKI_KEYWORD": "true",
                },
                clear=False,
            ):
                evidence = RagEvidenceTool().call(
                    agent_id="dosing",
                    incident_type="dosing_abnormal",
                    phase="agent",
                    telemetry={"dosingRate": 2.8},
                    top_k=3,
                )

        self.assertEqual(len(evidence), 1)
        self.assertEqual(evidence[0]["source_locator"], "wiki/加药分域.md#section-1")


if __name__ == "__main__":
    unittest.main()
