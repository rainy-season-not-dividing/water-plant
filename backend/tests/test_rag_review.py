from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
REVIEW_SCRIPT = PROJECT_ROOT / "scripts" / "review-rag-pending.py"
SPEC = importlib.util.spec_from_file_location("review_rag_pending", REVIEW_SCRIPT)
assert SPEC is not None
review_rag_pending = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(review_rag_pending)


FIXED_TIME = "2026-07-08T10:00:00+08:00"


class RagReviewTest(unittest.TestCase):
    def test_approve_all_writes_default_approved_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = _write_pending_file(Path(temp_dir) / "rag_review" / "source.pending.json")

            result = review_rag_pending.approve_all_pending_file(
                input_path,
                reviewer="alice",
                note="checked",
                reviewed_at=FIXED_TIME,
            )

            output_path = Path(result["approved_path"])
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(output_path.parent.name, "rag_approved")
            self.assertEqual(output_path.name, "source.approved.json")
            self.assertEqual(payload["status"], "approved")
            self.assertEqual(payload["block_count"], 2)
            self.assertEqual(payload["review_summary"]["mode"], "approve_all")
            self.assertEqual(payload["review_summary"]["reviewer"], "alice")
            self.assertEqual(payload["review_summary"]["review_note"], "checked")
            self.assertTrue(all(block["status"] == "approved" for block in payload["blocks"]))
            extra = payload["blocks"][0]["metadata"]["extra"]
            self.assertEqual(extra["reviewed_by"], "alice")
            self.assertEqual(extra["reviewed_at"], FIXED_TIME)
            self.assertEqual(extra["review_mode"], "approve_all")
            self.assertEqual(extra["review_note"], "checked")

    def test_approve_all_supports_custom_output_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = _write_pending_file(Path(temp_dir) / "rag_review" / "source.pending.json")
            output_path = Path(temp_dir) / "custom" / "approved.json"

            review_rag_pending.approve_all_pending_file(
                input_path,
                output_path=output_path,
                reviewed_at=FIXED_TIME,
            )

            self.assertTrue(output_path.exists())
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["status"], "approved")

    def test_approve_all_refuses_existing_output_without_force(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = _write_pending_file(Path(temp_dir) / "rag_review" / "source.pending.json")
            output_path = Path(temp_dir) / "rag_approved" / "source.approved.json"
            output_path.parent.mkdir(parents=True)
            output_path.write_text("{}", encoding="utf-8")

            with self.assertRaisesRegex(review_rag_pending.ReviewError, "already exists"):
                review_rag_pending.approve_all_pending_file(input_path, reviewed_at=FIXED_TIME)

            review_rag_pending.approve_all_pending_file(input_path, reviewed_at=FIXED_TIME, force=True)
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["status"], "approved")

    def test_validate_rejects_non_pending_top_level_status(self) -> None:
        payload = _pending_payload()
        payload["status"] = "approved"

        with self.assertRaisesRegex(review_rag_pending.ReviewError, "top-level status"):
            review_rag_pending.approve_all_payload(payload, reviewed_at=FIXED_TIME)

    def test_validate_rejects_missing_blocks(self) -> None:
        payload = _pending_payload()
        del payload["blocks"]

        with self.assertRaisesRegex(review_rag_pending.ReviewError, "blocks"):
            review_rag_pending.approve_all_payload(payload, reviewed_at=FIXED_TIME)

    def test_validate_rejects_block_status_not_pending(self) -> None:
        payload = _pending_payload()
        payload["blocks"][0]["status"] = "approved"

        with self.assertRaisesRegex(review_rag_pending.ReviewError, "block 1 status"):
            review_rag_pending.approve_all_payload(payload, reviewed_at=FIXED_TIME)

    def test_interactive_core_handles_approve_reject_edit_and_skip(self) -> None:
        payload = _pending_payload(block_count=4)
        commands = iter(["a", "r", "e", "edited text", "s"])

        result = review_rag_pending.run_interactive_review(
            payload,
            reviewer="bob",
            note="session note",
            reviewed_at=FIXED_TIME,
            input_func=lambda prompt: next(commands),
            output_func=lambda line: None,
        )

        summary = result["summary"]
        self.assertEqual(summary["approved_count"], 2)
        self.assertEqual(summary["rejected_count"], 1)
        self.assertEqual(summary["edited_count"], 1)
        self.assertEqual(summary["skipped_count"], 1)

        approved_blocks = result["approved_payload"]["blocks"]
        rejected_blocks = result["rejected_payload"]["blocks"]
        progress_blocks = result["progress_payload"]["blocks"]
        self.assertEqual(approved_blocks[0]["status"], "approved")
        self.assertEqual(approved_blocks[1]["text"], "edited text")
        self.assertEqual(approved_blocks[1]["char_count"], len("edited text"))
        self.assertEqual(approved_blocks[1]["metadata"]["extra"]["review_action"], "edit")
        self.assertEqual(rejected_blocks[0]["status"], "rejected")
        self.assertEqual(progress_blocks[0]["status"], "pending_review")
        self.assertEqual(progress_blocks[0]["metadata"]["extra"]["review_action"], "skip")

    def test_interactive_file_writes_three_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = _write_pending_file(Path(temp_dir) / "rag_review" / "source.pending.json", block_count=3)
            commands = iter(["a", "r", "q"])

            result = review_rag_pending.review_pending_file_interactive(
                input_path,
                reviewer="carol",
                reviewed_at=FIXED_TIME,
                input_func=lambda prompt: next(commands),
                output_func=lambda line: None,
            )

            self.assertTrue(Path(result["approved_path"]).exists())
            self.assertTrue(Path(result["rejected_path"]).exists())
            self.assertTrue(Path(result["progress_path"]).exists())
            progress = json.loads(Path(result["progress_path"]).read_text(encoding="utf-8"))
            self.assertEqual(progress["status"], "review_progress")
            self.assertEqual(progress["block_count"], 1)


def _write_pending_file(path: Path, *, block_count: int = 2) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_pending_payload(block_count=block_count), ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _pending_payload(*, block_count: int = 2) -> dict:
    blocks = []
    for index in range(block_count):
        blocks.append(
            {
                "id": f"block-{index + 1}",
                "text": f"knowledge text {index + 1}",
                "metadata": {
                    "source": "source.docx",
                    "knowledge_type": "process_doc",
                    "agent_scope": [],
                    "process_areas": [],
                    "device_ids": [],
                    "incident_types": [],
                    "source_version": None,
                    "safety_level": None,
                    "effective_time": None,
                    "extra": {"block_kind": "paragraph"},
                },
                "status": "pending_review",
                "title": "Section",
                "section_path": ["Section"],
                "source_locator": f"source.docx#block-{index + 1}",
                "char_count": len(f"knowledge text {index + 1}"),
            }
        )
    return {
        "source": "source.docx",
        "input_path": "source.docx",
        "status": "pending_review",
        "block_count": block_count,
        "blocks": blocks,
    }


if __name__ == "__main__":
    unittest.main()
