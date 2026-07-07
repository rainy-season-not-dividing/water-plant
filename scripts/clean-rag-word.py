from __future__ import annotations

import argparse
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.rag.cleaning import KnowledgeCleaningPipeline, write_pending_blocks_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean a Word .docx file into pending-review RAG knowledge blocks."
    )
    parser.add_argument("input", type=Path, help="Path to the source .docx file.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output JSON path. Defaults to backend/data/rag_review/<input-stem>.pending.json.",
    )
    parser.add_argument("--source", help="Stable source name stored in metadata.")
    parser.add_argument(
        "--knowledge-type",
        default="process_doc",
        choices=[
            "process_doc",
            "equipment_manual",
            "operation_case",
            "runtime_log",
            "safety_rule",
            "human_confirmation",
            "plan_rationale",
        ],
        help="Knowledge type metadata for every pending block.",
    )
    parser.add_argument(
        "--agent-scope",
        action="append",
        default=[],
        help="Agent id allowed to use this knowledge after approval. Repeat for multiple agents.",
    )
    parser.add_argument(
        "--process-area",
        dest="process_areas",
        action="append",
        default=[],
        help="Process area tag for this knowledge. Repeat for multiple areas.",
    )
    parser.add_argument(
        "--device-id",
        dest="device_ids",
        action="append",
        default=[],
        help="Device id related to this knowledge. Repeat for multiple devices.",
    )
    parser.add_argument(
        "--incident-type",
        dest="incident_types",
        action="append",
        default=[],
        help="Incident type related to this knowledge. Repeat for multiple incident types.",
    )
    parser.add_argument("--source-version", help="Optional source version metadata.")
    parser.add_argument("--safety-level", help="Optional safety level metadata.")
    parser.add_argument("--effective-time", help="Optional effective time metadata.")
    parser.add_argument("--chunk-size", type=int, default=900)
    parser.add_argument("--overlap", type=int, default=120)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = args.source or args.input.name
    output = args.output or (BACKEND_ROOT / "data" / "rag_review" / f"{args.input.stem}.pending.json")
    pipeline = KnowledgeCleaningPipeline(chunk_size=args.chunk_size, overlap=args.overlap)
    blocks = pipeline.clean_docx(
        args.input,
        source=source,
        knowledge_type=args.knowledge_type,
        agent_scope=args.agent_scope,
        process_areas=args.process_areas,
        device_ids=args.device_ids,
        incident_types=args.incident_types,
        source_version=args.source_version,
        safety_level=args.safety_level,
        effective_time=args.effective_time,
    )
    summary = write_pending_blocks_json(blocks, output, source=source, input_path=args.input)
    print(f"Wrote {summary.block_count} pending-review blocks to {summary.output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
