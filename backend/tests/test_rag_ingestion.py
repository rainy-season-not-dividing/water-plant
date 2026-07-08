from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from app.rag.ingestion import (
    IngestionValidationError,
    dry_run_approved_file,
    dry_run_approved_payload,
    plan_embedding_chunks,
    validate_approved_payload,
)


class RagIngestionTest(unittest.TestCase):
    def test_validate_accepts_approved_payload(self) -> None:
        payload = _approved_payload()

        validate_approved_payload(payload)

    def test_validate_rejects_non_approved_top_level_status(self) -> None:
        payload = _approved_payload()
        payload["status"] = "pending_review"

        with self.assertRaisesRegex(IngestionValidationError, "top-level status"):
            validate_approved_payload(payload)

    def test_validate_rejects_block_status_not_approved(self) -> None:
        payload = _approved_payload()
        payload["blocks"][0]["status"] = "pending_review"

        with self.assertRaisesRegex(IngestionValidationError, "block 1 status"):
            validate_approved_payload(payload)

    def test_validate_rejects_duplicate_id(self) -> None:
        payload = _approved_payload(block_count=2)
        payload["blocks"][1]["id"] = payload["blocks"][0]["id"]

        with self.assertRaisesRegex(IngestionValidationError, "duplicate block id"):
            validate_approved_payload(payload)

    def test_validate_rejects_duplicate_source_locator(self) -> None:
        payload = _approved_payload(block_count=2)
        payload["blocks"][1]["source_locator"] = payload["blocks"][0]["source_locator"]

        with self.assertRaisesRegex(IngestionValidationError, "duplicate source_locator"):
            validate_approved_payload(payload)

    def test_validate_rejects_empty_text(self) -> None:
        payload = _approved_payload()
        payload["blocks"][0]["text"] = ""
        payload["blocks"][0]["char_count"] = 0

        with self.assertRaisesRegex(IngestionValidationError, "block.text must be a non-empty string"):
            validate_approved_payload(payload)

    def test_validate_rejects_bad_char_count(self) -> None:
        payload = _approved_payload()
        payload["blocks"][0]["char_count"] = 999

        with self.assertRaisesRegex(IngestionValidationError, "char_count"):
            validate_approved_payload(payload)

    def test_plan_embedding_chunks_uses_section_path_without_mutating_payload(self) -> None:
        payload = _approved_payload()

        chunks = plan_embedding_chunks(payload)

        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0].chunk_type, "content_chunk")
        self.assertEqual(chunks[0].display_text, "7.1.1 Use renewable energy first.")
        self.assertEqual(
            chunks[0].text_for_embedding,
            "7 Energy / 7.1 General\n7.1.1 Use renewable energy first.",
        )
        self.assertEqual(chunks[0].metadata["approved_block_id"], "block-1")
        self.assertEqual(chunks[0].metadata["source"], "standard.docx")
        self.assertEqual(chunks[0].metadata["knowledge_type"], "process_doc")
        self.assertEqual(chunks[0].metadata["section_path"], ["7 Energy", "7.1 General"])
        self.assertEqual(chunks[0].metadata["source_locator"], "standard.docx#block-1")
        self.assertEqual(chunks[0].metadata["reviewed_by"], "alice")
        self.assertNotIn("raw_text", payload["blocks"][0])
        self.assertNotIn("context_text", payload["blocks"][0])

    def test_dry_run_reports_distribution_and_warnings(self) -> None:
        payload = _approved_payload(block_count=3)
        payload["blocks"][1]["section_path"] = []
        payload["blocks"][1]["text"] = "ICS"
        payload["blocks"][1]["char_count"] = 3
        payload["blocks"][1]["metadata"]["extra"]["block_kind"] = "table_row"
        payload["blocks"][2]["text"] = "x" * 1300
        payload["blocks"][2]["char_count"] = 1300

        chunks, report = dry_run_approved_payload(payload, sample_size=2)

        self.assertEqual(len(chunks), 3)
        self.assertEqual(report.approved_block_count, 3)
        self.assertEqual(report.planned_chunk_count, 3)
        self.assertEqual(report.skipped_count, 0)
        self.assertEqual(report.by_block_kind, {"paragraph": 2, "table_row": 1})
        self.assertEqual(report.by_knowledge_type, {"process_doc": 3})
        self.assertEqual(report.empty_section_path_count, 1)
        self.assertEqual(report.short_text_count, 1)
        self.assertEqual(report.long_text_count, 1)
        self.assertEqual(len(report.longest_chunks), 2)
        self.assertTrue(any("empty section_path" in warning for warning in report.warnings))

    def test_dry_run_file_reads_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            approved_path = Path(temp_dir) / "source.approved.json"
            approved_path.write_text(
                json.dumps(_approved_payload(), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

            chunks, report = dry_run_approved_file(approved_path)

            self.assertEqual(len(chunks), 1)
            self.assertEqual(report.source, "standard.docx")


def _approved_payload(*, block_count: int = 1) -> dict:
    blocks = []
    for index in range(block_count):
        text = "7.1.1 Use renewable energy first."
        blocks.append(
            {
                "id": f"block-{index + 1}",
                "text": text,
                "metadata": {
                    "source": "standard.docx",
                    "knowledge_type": "process_doc",
                    "agent_scope": ["supervisor"],
                    "process_areas": ["energy"],
                    "device_ids": [],
                    "incident_types": [],
                    "source_version": "v1",
                    "safety_level": "review_required",
                    "effective_time": "2026-07-08",
                    "extra": {
                        "document_kind": "docx",
                        "block_kind": "paragraph",
                        "reviewed_by": "alice",
                        "reviewed_at": "2026-07-08T10:00:00+08:00",
                        "review_mode": "approve_all",
                        "review_action": "approve",
                        "review_note": "",
                    },
                },
                "status": "approved",
                "title": "7.1 General",
                "section_path": ["7 Energy", "7.1 General"],
                "source_locator": f"standard.docx#block-{index + 1}",
                "char_count": len(text),
            }
        )
    return {
        "source": "standard.docx",
        "input_path": "standard.docx",
        "status": "approved",
        "block_count": block_count,
        "blocks": blocks,
        "review_summary": {
            "mode": "approve_all",
            "reviewer": "alice",
            "reviewed_at": "2026-07-08T10:00:00+08:00",
            "approved_count": block_count,
            "rejected_count": 0,
            "edited_count": 0,
            "skipped_count": 0,
        },
    }


if __name__ == "__main__":
    unittest.main()
