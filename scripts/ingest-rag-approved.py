from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.rag.ingestion import IngestionValidationError, dry_run_approved_file


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Preflight approved RAG knowledge blocks before embedding and vector-store writes."
    )
    parser.add_argument("input", type=Path, help="Path to a *.approved.json file.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        required=True,
        help="Validate and plan embedding chunks without calling embeddings or writing Qdrant.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the full dry-run report as JSON.",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=10,
        help="Number of shortest/longest chunk samples to include in the report.",
    )
    parser.add_argument(
        "--short-text-threshold",
        type=int,
        default=20,
        help="Text length threshold used to count short text candidates.",
    )
    parser.add_argument(
        "--long-text-threshold",
        type=int,
        default=1200,
        help="Embedding text length threshold used to count long chunk candidates.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        _, report = dry_run_approved_file(
            args.input,
            short_text_threshold=args.short_text_threshold,
            long_text_threshold=args.long_text_threshold,
            sample_size=args.sample_size,
        )
    except IngestionValidationError as exc:
        print(f"Ingestion dry-run failed: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report.to_dict(), ensure_ascii=False, indent=2))
    else:
        _print_report(report.to_dict())
    return 0


def _print_report(report: dict) -> None:
    print("RAG approved ingestion dry-run")
    print(f"source: {report.get('source')}")
    print(f"input_path: {report.get('input_path')}")
    print(f"approved_block_count: {report['approved_block_count']}")
    print(f"planned_chunk_count: {report['planned_chunk_count']}")
    print(f"skipped_count: {report['skipped_count']}")
    print(f"empty_section_path_count: {report['empty_section_path_count']}")
    print(f"short_text_count: {report['short_text_count']}")
    print(f"long_text_count: {report['long_text_count']}")
    print(f"by_block_kind: {json.dumps(report['by_block_kind'], ensure_ascii=False, sort_keys=True)}")
    print(f"by_knowledge_type: {json.dumps(report['by_knowledge_type'], ensure_ascii=False, sort_keys=True)}")
    if report["warnings"]:
        print("warnings:")
        for warning in report["warnings"]:
            print(f"  - {warning}")
    else:
        print("warnings: none")


if __name__ == "__main__":
    raise SystemExit(main())
